package gitcfg

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

type gitConfigEntry struct {
	key   string
	value string
	scope ConfigScope
	file  string
	line  int
	order int
}

func readGitConfig(ctx context.Context, repoPath string) (map[string]ConfigValue, error) {
	if repoPath == "" {
		return nil, errors.New("repository path cannot be empty")
	}

	cmd := exec.CommandContext(ctx, "git", "-C", repoPath, "config", "--null", "--show-origin", "--show-scope", "--list")

	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("git config failed: %w", err)
	}

	entries, err := parseGitConfigOutput(output)
	if err != nil {
		return nil, err
	}

	return buildConfigValues(entries), nil
}

func readGlobalConfig(ctx context.Context) (map[string]ConfigValue, error) {
	cmd := exec.CommandContext(ctx, "git", "config", "--null", "--show-origin", "--show-scope", "--list", "--global")

	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("git config --global failed: %w", err)
	}

	entries, err := parseGitConfigOutput(output)
	if err != nil {
		return nil, err
	}
	return buildConfigValues(entries), nil
}

func parseGitConfigOutput(raw []byte) ([]gitConfigEntry, error) {
	if len(raw) == 0 {
		return nil, nil
	}

	chunks := bytes.Split(raw, []byte{0})
	entries := make([]gitConfigEntry, 0, len(chunks)/3)

	for i, order := 0, 0; i+2 < len(chunks); {
		scopeRaw := string(chunks[i])
		originRaw := string(chunks[i+1])
		keyValueRaw := chunks[i+2]
		i += 3

		if scopeRaw == "" && originRaw == "" && len(keyValueRaw) == 0 {
			continue
		}

		key, value := splitKeyValue(keyValueRaw)
		if key == "" {
			continue
		}

		file, line := normalizeOrigin(originRaw)
		entry := gitConfigEntry{
			key:   key,
			value: value,
			scope: ConfigScope(strings.ToLower(scopeRaw)),
			file:  file,
			line:  line,
			order: order,
		}
		order++
		entries = append(entries, entry)
	}

	return entries, nil
}

func splitKeyValue(raw []byte) (string, string) {
	parts := bytes.SplitN(raw, []byte{'\n'}, 2)
	if len(parts) == 0 {
		return "", ""
	}

	key := string(parts[0])
	if len(parts) == 1 {
		return key, ""
	}
	return key, string(parts[1])
}

func normalizeOrigin(origin string) (string, int) {
	if origin == "" {
		return "", 0
	}
	const prefix = "file:"
	if !strings.HasPrefix(origin, prefix) {
		return origin, 0
	}

	pathWithLine := origin[len(prefix):]

	colon := strings.LastIndex(pathWithLine, ":")
	if colon == -1 {
		return pathWithLine, 0
	}

	lineCandidate := pathWithLine[colon+1:]
	if line, err := strconv.Atoi(lineCandidate); err == nil {
		return pathWithLine[:colon], line
	}

	return pathWithLine, 0
}

func buildConfigValues(entries []gitConfigEntry) map[string]ConfigValue {
	if len(entries) == 0 {
		return map[string]ConfigValue{}
	}

	byKey := make(map[string][]gitConfigEntry)
	for _, entry := range entries {
		byKey[entry.key] = append(byKey[entry.key], entry)
	}

	result := make(map[string]ConfigValue, len(byKey))
	for key, items := range byKey {
		sort.SliceStable(items, func(i, j int) bool {
			return items[i].order < items[j].order
		})

		active := items[len(items)-1]
		value := ConfigValue{
			Key:   key,
			Value: active.value,
			Source: ConfigSource{
				Scope: active.scope,
				File:  active.file,
				Line:  active.line,
			},
			LastModified: "",
		}

		if len(items) > 1 {
			overrides := make([]ConfigOverride, 0, len(items)-1)
			for i := len(items) - 2; i >= 0; i-- {
				entry := items[i]
				overrides = append(overrides, ConfigOverride{
					Value: entry.value,
					Source: ConfigSource{
						Scope: entry.scope,
						File:  entry.file,
						Line:  entry.line,
					},
					Timestamp: "",
				})
			}
			value.Overrides = overrides
		}

		result[key] = value
	}

	return result
}

func buildRepository(ctx context.Context, path string) (Repository, error) {
	if path == "" {
		return Repository{}, errors.New("path cannot be empty")
	}

	topLevel, err := gitQuery(ctx, path, "rev-parse", "--show-toplevel")
	if err != nil {
		return Repository{}, fmt.Errorf("resolve repository root: %w", err)
	}
	topLevel = strings.TrimSpace(topLevel)
	if topLevel == "" {
		return Repository{}, errors.New("git repository root is empty")
	}

	gitDirRaw, err := gitQuery(ctx, path, "rev-parse", "--git-dir")
	if err != nil {
		return Repository{}, fmt.Errorf("resolve git dir: %w", err)
	}
	gitDir := strings.TrimSpace(gitDirRaw)
	if !filepath.IsAbs(gitDir) {
		gitDir = filepath.Join(topLevel, gitDir)
	}

	gitCommonDirRaw, err := gitQuery(ctx, path, "rev-parse", "--git-common-dir")
	if err != nil {
		return Repository{}, fmt.Errorf("resolve git common dir: %w", err)
	}
	gitCommonDir := strings.TrimSpace(gitCommonDirRaw)
	if !filepath.IsAbs(gitCommonDir) {
		gitCommonDir = filepath.Join(topLevel, gitCommonDir)
	}

	isBareRaw, err := gitQuery(ctx, path, "rev-parse", "--is-bare-repository")
	if err != nil {
		return Repository{}, fmt.Errorf("resolve repository type: %w", err)
	}
	isBare := strings.TrimSpace(isBareRaw) == "true"

	name := filepath.Base(topLevel)
	if name == "" {
		name = "repository"
	}

	superProjectRaw, err := gitQuery(ctx, path, "rev-parse", "--show-superproject-working-tree")
	if err != nil {
		return Repository{}, fmt.Errorf("resolve super project: %w", err)
	}
	isSubmodule := strings.TrimSpace(superProjectRaw) != ""

	repoType := RepositoryTypeStandard
	if isBare {
		repoType = RepositoryTypeBare
	}

	return Repository{
		ID:           ensureID(topLevel),
		Name:         name,
		Path:         topLevel,
		Root:         path,
		Type:         repoType,
		GitDir:       gitDir,
		IsBare:       isBare,
		IsWorktree:   !isBare && !samePath(gitDir, gitCommonDir),
		IsSubmodule:  isSubmodule,
		LastScanTime: timestamp(time.Now()),
		Status:       RepoStatusIdle,
	}, nil
}

func gitQuery(ctx context.Context, workingDir string, args ...string) (string, error) {
	allArgs := append([]string{"-C", workingDir}, args...)
	cmd := exec.CommandContext(ctx, "git", allArgs...)
	out, err := cmd.Output()
	if err != nil {
		return "", err
	}
	return string(out), nil
}

func samePath(a, b string) bool {
	if a == "" || b == "" {
		return false
	}

	normalizedA := filepath.Clean(a)
	normalizedB := filepath.Clean(b)
	return normalizedA == normalizedB
}
