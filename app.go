package main

import (
	"context"
	"fmt"

	"git-config-manager/internal/gitcfg"
)

// App struct
type App struct {
	ctx context.Context

	service *gitcfg.Service
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{
		service: gitcfg.NewService(),
	}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// Greet returns a greeting for the given name
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, It's show time!", name)
}

// ListRoots returns all scanning roots configured in the service.
func (a *App) ListRoots() []string {
	return a.service.ListRoots()
}

// AddRoot registers a new root path.
func (a *App) AddRoot(path string) error {
	return a.service.AddRoot(path)
}

// RemoveRoot removes a tracked root path.
func (a *App) RemoveRoot(path string) {
	a.service.RemoveRoot(path)
}

// ScanRepositories triggers a repository scan for all roots.
func (a *App) ScanRepositories(opts gitcfg.ScanOptions) ([]gitcfg.Repository, error) {
	return a.service.Scan(a.ctx, opts)
}

// GetEffectiveConfig resolves configuration for a repository.
func (a *App) GetEffectiveConfig(repositoryID string) (gitcfg.ConfigMatrix, error) {
	return a.service.GetEffectiveConfig(a.ctx, repositoryID)
}

// WriteConfig performs a write operation for a repository.
func (a *App) WriteConfig(req gitcfg.WriteRequest) (gitcfg.ChangeSet, error) {
	return a.service.WriteConfig(a.ctx, req)
}

// ListChangeSets returns the recorded change sets for a repository.
func (a *App) ListChangeSets(repositoryID string) []gitcfg.ChangeSet {
	return a.service.ListChangeSets(repositoryID)
}

// Rollback reverts a recorded change set.
func (a *App) Rollback(changeSetID string) (gitcfg.ChangeSet, error) {
	return a.service.Rollback(a.ctx, changeSetID)
}

// ListIncludeRules returns the includeIf rules.
func (a *App) ListIncludeRules() ([]gitcfg.IncludeRule, error) {
	return a.service.ListRules(a.ctx)
}

// UpsertIncludeRule creates or updates an include rule.
func (a *App) UpsertIncludeRule(rule gitcfg.IncludeRule) (gitcfg.IncludeRule, error) {
	return a.service.UpsertRule(a.ctx, rule)
}

// DeleteIncludeRule removes an include rule by id.
func (a *App) DeleteIncludeRule(id string) error {
	return a.service.DeleteRule(a.ctx, id)
}

// ToggleIncludeRule flips the enabled status of an include rule.
func (a *App) ToggleIncludeRule(id string, enabled bool) (gitcfg.IncludeRule, error) {
	return a.service.ToggleRule(a.ctx, id, enabled)
}

// RunDiagnostics triggers the diagnostics subsystem for a repository.
func (a *App) RunDiagnostics(repositoryID string) (gitcfg.DiagnosticsReport, error) {
	return a.service.RunDiagnostics(a.ctx, repositoryID)
}
