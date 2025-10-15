package gitcfg

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"sync"
	"time"

	"github.com/google/uuid"
)

// RepositoryService exposes operations related to root management and repository scanning.
type RepositoryService interface {
	ListRoots() []string
	AddRoot(path string) error
	RemoveRoot(path string)
	Scan(ctx context.Context, opts ScanOptions) ([]Repository, error)
}

// ConfigurationService handles reading and writing git configuration data.
type ConfigurationService interface {
	GetEffectiveConfig(ctx context.Context, repositoryID string) (ConfigMatrix, error)
	WriteConfig(ctx context.Context, req WriteRequest) (ChangeSet, error)
	ListChangeSets(repositoryID string) []ChangeSet
	Rollback(ctx context.Context, changeSetID string) (ChangeSet, error)
}

// RuleService manages includeIf rules.
type RuleService interface {
	ListRules(ctx context.Context) ([]IncludeRule, error)
	UpsertRule(ctx context.Context, rule IncludeRule) (IncludeRule, error)
	DeleteRule(ctx context.Context, id string) error
	ToggleRule(ctx context.Context, id string, enabled bool) (IncludeRule, error)
}

// DiagnosticsService evaluates data parity between internal state and git CLI output.
type DiagnosticsService interface {
	RunDiagnostics(ctx context.Context, repositoryID string) (DiagnosticsReport, error)
}

// Service combines the individual services to simplify wiring with the UI layer.
type Service struct {
	mu           sync.RWMutex
	roots        map[string]struct{}
	repositories map[string]Repository
	includeRules map[string]IncludeRule
	changeSets   map[string]ChangeSet
}

// NewService constructs a new in-memory Service instance primed with sensible defaults.
func NewService() *Service {
	return &Service{
		roots:        make(map[string]struct{}),
		repositories: make(map[string]Repository),
		includeRules: make(map[string]IncludeRule),
		changeSets:   make(map[string]ChangeSet),
	}
}

// ListRoots returns the sorted roots currently tracked by the service.
func (s *Service) ListRoots() []string {
	s.mu.RLock()
	defer s.mu.RUnlock()

	roots := make([]string, 0, len(s.roots))
	for root := range s.roots {
		roots = append(roots, root)
	}
	sort.Strings(roots)
	return roots
}

// AddRoot registers a new scanning root.
func (s *Service) AddRoot(path string) error {
	if path == "" {
		return errors.New("path cannot be empty")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	s.roots[path] = struct{}{}
	return nil
}

// RemoveRoot deregisters a scanning root.
func (s *Service) RemoveRoot(path string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	delete(s.roots, path)
}

// Scan synthesises repositories for the configured roots. Placeholder implementation.
func (s *Service) Scan(ctx context.Context, opts ScanOptions) ([]Repository, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}

	now := time.Now()
	results := make([]Repository, 0, len(s.roots))

	for root := range s.roots {
		id := ensureID(root)
		repo := Repository{
			ID:           id,
			Name:         fallbackName(root),
			Path:         root,
			Root:         root,
			Type:         RepositoryTypeUnknown,
			GitDir:       fmt.Sprintf("%s/.git", root),
			LastScanTime: timestamp(now),
			Status:       RepoStatusIdle,
		}
		s.repositories[id] = repo
		results = append(results, repo)
	}

	sort.Slice(results, func(i, j int) bool {
		return results[i].Name < results[j].Name
	})

	return results, nil
}

// GetEffectiveConfig returns canned configuration data to unblock UI development.
func (s *Service) GetEffectiveConfig(ctx context.Context, repositoryID string) (ConfigMatrix, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	select {
	case <-ctx.Done():
		return ConfigMatrix{}, ctx.Err()
	default:
	}

	repo, ok := s.repositories[repositoryID]
	if !ok {
		return ConfigMatrix{}, fmt.Errorf("repository %q not found", repositoryID)
	}

	now := time.Now()
	entries := map[string]ConfigValue{
		"user.name": {
			Key:   "user.name",
			Value: "Sample User",
			Source: ConfigSource{
				Scope: ConfigScopeLocal,
				File:  fmt.Sprintf("%s/.git/config", repo.Path),
				Line:  2,
			},
			Overrides: []ConfigOverride{
				{
					Value: "Global User",
					Source: ConfigSource{
						Scope: ConfigScopeGlobal,
						File:  "~/.gitconfig",
						Line:  12,
					},
					Timestamp: timestamp(now.Add(-24 * time.Hour)),
				},
			},
			LastModified: timestamp(now.Add(-2 * time.Hour)),
		},
		"user.email": {
			Key:   "user.email",
			Value: "sample@example.com",
			Source: ConfigSource{
				Scope: ConfigScopeInclude,
				File:  "~/.config/git/work.cfg",
				Line:  8,
			},
			LastModified: timestamp(now.Add(-4 * time.Hour)),
		},
	}

	matrix := ConfigMatrix{
		RepositoryID: repositoryID,
		Entries:      entries,
		RetrievedAt:  timestamp(now),
	}

	return matrix, nil
}

// WriteConfig records the request as a synthetic change set.
func (s *Service) WriteConfig(ctx context.Context, req WriteRequest) (ChangeSet, error) {
	select {
	case <-ctx.Done():
		return ChangeSet{}, ctx.Err()
	default:
	}

	if req.Key == "" {
		return ChangeSet{}, errors.New("key cannot be empty")
	}

	cs := ChangeSet{
		ID:           uuid.NewString(),
		RepositoryID: req.RepositoryID,
		Scope:        req.Scope,
		FilePath:     req.TargetPath,
		Diff:         fmt.Sprintf("+ %s = %q\n", req.Key, req.Value),
		CreatedAt:    timestamp(time.Now()),
	}

	s.mu.Lock()
	s.changeSets[cs.ID] = cs
	s.mu.Unlock()

	return cs, nil
}

// ListChangeSets returns the stored changes for a repository.
func (s *Service) ListChangeSets(repositoryID string) []ChangeSet {
	s.mu.RLock()
	defer s.mu.RUnlock()

	changes := make([]ChangeSet, 0, len(s.changeSets))
	for _, cs := range s.changeSets {
		if cs.RepositoryID == repositoryID {
			changes = append(changes, cs)
		}
	}

	sort.Slice(changes, func(i, j int) bool {
		return changes[i].CreatedAt > changes[j].CreatedAt
	})
	return changes
}

// Rollback returns the stored change set. Actual rollback is to be implemented.
func (s *Service) Rollback(ctx context.Context, changeSetID string) (ChangeSet, error) {
	select {
	case <-ctx.Done():
		return ChangeSet{}, ctx.Err()
	default:
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	cs, ok := s.changeSets[changeSetID]
	if !ok {
		return ChangeSet{}, fmt.Errorf("changeset %q not found", changeSetID)
	}
	return cs, nil
}

// ListRules returns includeIf rules tracked in memory.
func (s *Service) ListRules(ctx context.Context) ([]IncludeRule, error) {
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	rules := make([]IncludeRule, 0, len(s.includeRules))
	for _, rule := range s.includeRules {
		rules = append(rules, rule)
	}

	sort.Slice(rules, func(i, j int) bool {
		return rules[i].Pattern < rules[j].Pattern
	})
	return rules, nil
}

// UpsertRule stores a rule in memory.
func (s *Service) UpsertRule(ctx context.Context, rule IncludeRule) (IncludeRule, error) {
	select {
	case <-ctx.Done():
		return IncludeRule{}, ctx.Err()
	default:
	}

	if rule.Pattern == "" {
		return IncludeRule{}, errors.New("pattern cannot be empty")
	}
	if rule.TargetPath == "" {
		return IncludeRule{}, errors.New("targetPath cannot be empty")
	}

	if rule.ID == "" {
		rule.ID = uuid.NewString()
	}
	rule.LastUpdated = timestamp(time.Now())

	s.mu.Lock()
	s.includeRules[rule.ID] = rule
	s.mu.Unlock()

	return rule, nil
}

// DeleteRule removes a rule from the in-memory store.
func (s *Service) DeleteRule(ctx context.Context, id string) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	delete(s.includeRules, id)
	return nil
}

// ToggleRule flips the enabled state of a stored rule.
func (s *Service) ToggleRule(ctx context.Context, id string, enabled bool) (IncludeRule, error) {
	select {
	case <-ctx.Done():
		return IncludeRule{}, ctx.Err()
	default:
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	rule, ok := s.includeRules[id]
	if !ok {
		return IncludeRule{}, fmt.Errorf("rule %q not found", id)
	}

	rule.Enabled = enabled
	rule.LastUpdated = timestamp(time.Now())
	s.includeRules[id] = rule
	return rule, nil
}

// RunDiagnostics returns a canned report.
func (s *Service) RunDiagnostics(ctx context.Context, repositoryID string) (DiagnosticsReport, error) {
	select {
	case <-ctx.Done():
		return DiagnosticsReport{}, ctx.Err()
	default:
	}

	if repositoryID == "" {
		return DiagnosticsReport{}, errors.New("repositoryID cannot be empty")
	}

	report := DiagnosticsReport{
		RepositoryID: repositoryID,
		CheckedAt:    timestamp(time.Now()),
		Issues: []DiagnosticIssue{
			{
				Severity:   "info",
				Message:    "Diagnostic subsystem is not yet wired to git CLI.",
				Suggestion: "Implement git config parity check.",
			},
		},
	}
	return report, nil
}

func ensureID(input string) string {
	// Deterministic fallback for now: use UUID5 style hashing for stability.
	u := uuid.NewSHA1(uuid.Nil, []byte(input))
	return u.String()
}

func fallbackName(path string) string {
	if path == "" {
		return "repository"
	}

	for i := len(path) - 1; i >= 0; i-- {
		switch path[i] {
		case '/', '\\':
			if i == len(path)-1 {
				continue
			}
			return path[i+1:]
		}
	}
	return path
}

func timestamp(t time.Time) string {
	return t.UTC().Format(time.RFC3339Nano)
}
