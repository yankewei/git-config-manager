package gitcfg

import (
	"bytes"
	"testing"
)

func TestParseGitConfigOutputAndBuildValues(t *testing.T) {
	raw := bytes.Join([][]byte{
		[]byte("system"),
		[]byte("file:/etc/gitconfig"),
		[]byte("user.name\nSystem User"),
		[]byte("local"),
		[]byte("file:/work/repo/.git/config:12"),
		[]byte("user.name\nRepo User"),
		[]byte("env"),
		[]byte("command line"),
		[]byte("core.editor\nvim"),
	}, []byte{0})

	entries, err := parseGitConfigOutput(raw)
	if err != nil {
		t.Fatalf("parseGitConfigOutput returned error: %v", err)
	}

	if got, want := len(entries), 3; got != want {
		t.Fatalf("expected %d entries, got %d", want, got)
	}

	values := buildConfigValues(entries)

	userName, ok := values["user.name"]
	if !ok {
		t.Fatalf("expected user.name to be present")
	}
	if userName.Value != "Repo User" {
		t.Fatalf("expected active value Repo User, got %q", userName.Value)
	}
	if userName.Source.Scope != ConfigScope("local") {
		t.Fatalf("expected active scope local, got %q", userName.Source.Scope)
	}
	if userName.Source.Line != 12 {
		t.Fatalf("expected line 12, got %d", userName.Source.Line)
	}

	if gotOverrides := len(userName.Overrides); gotOverrides != 1 {
		t.Fatalf("expected 1 override, got %d", gotOverrides)
	}
	override := userName.Overrides[0]
	if override.Value != "System User" {
		t.Fatalf("expected override value System User, got %q", override.Value)
	}
	if override.Source.Scope != ConfigScope("system") {
		t.Fatalf("expected override scope system, got %q", override.Source.Scope)
	}

	coreEditor, ok := values["core.editor"]
	if !ok {
		t.Fatalf("expected core.editor to be present")
	}
	if coreEditor.Value != "vim" {
		t.Fatalf("expected editor vim, got %q", coreEditor.Value)
	}
	if coreEditor.Source.Scope != ConfigScope("env") {
		t.Fatalf("expected env scope, got %q", coreEditor.Source.Scope)
	}
	if coreEditor.Source.File != "command line" {
		t.Fatalf("expected origin 'command line', got %q", coreEditor.Source.File)
	}
}

func TestNormalizeOrigin(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		input    string
		wantFile string
		wantLine int
	}{
		{
			name:     "file without line",
			input:    "file:/etc/gitconfig",
			wantFile: "/etc/gitconfig",
			wantLine: 0,
		},
		{
			name:     "file with line number",
			input:    "file:/repo/.git/config:32",
			wantFile: "/repo/.git/config",
			wantLine: 32,
		},
		{
			name:     "windows path",
			input:    "file:C:/dev/.gitconfig",
			wantFile: "C:/dev/.gitconfig",
			wantLine: 0,
		},
		{
			name:     "non file origin",
			input:    "command line",
			wantFile: "command line",
			wantLine: 0,
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			file, line := normalizeOrigin(tt.input)
			if file != tt.wantFile || line != tt.wantLine {
				t.Fatalf("normalizeOrigin(%q) = (%q, %d), want (%q, %d)", tt.input, file, line, tt.wantFile, tt.wantLine)
			}
		})
	}
}
