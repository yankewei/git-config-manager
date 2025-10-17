import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DeleteIncludeRule,
  GetEffectiveConfig,
  GetGlobalConfig,
  ListChangeSets,
  ListIncludeRules,
  ListRoots,
  PickRoot,
  RemoveRoot,
  Rollback,
  ScanRepositories,
  ToggleIncludeRule,
  UpsertIncludeRule,
  WriteConfig,
} from "../wailsjs/go/main/App";
import { gitcfg } from "../wailsjs/go/models";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./components/ui/card";
import { Input } from "./components/ui/input";
import { ScrollArea } from "./components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { cn } from "./lib/utils";
import {
  Clock3,
  Disc3,
  FileDiff,
  FolderOpen,
  LoaderCircle,
  Power,
  RefreshCw,
  Trash2,
  Undo2,
} from "lucide-react";

type Repository = gitcfg.Repository;
type ConfigMatrix = gitcfg.ConfigMatrix;
type ConfigValue = gitcfg.ConfigValue;
type IncludeRule = gitcfg.IncludeRule;
type ChangeSet = gitcfg.ChangeSet;
type TabKey = "global" | "repositories";

type ConfigSectionGroup = {
  section: string;
  entries: ConfigValue[];
};

const DEFAULT_SECTION_NAME = "其他";

function groupConfigEntries(matrix: ConfigMatrix | null): ConfigSectionGroup[] {
  if (!matrix?.entries) {
    return [];
  }

  const sections = new Map<string, ConfigValue[]>();
  Object.values(matrix.entries).forEach((entry) => {
    const [rawSection] = entry.key.split(".");
    const sectionName =
      (rawSection && rawSection.trim()) || DEFAULT_SECTION_NAME;
    if (!sections.has(sectionName)) {
      sections.set(sectionName, []);
    }
    sections.get(sectionName)!.push(entry);
  });

  return Array.from(sections.entries())
    .map(([section, entries]) => ({
      section,
      entries: entries.sort((a, b) => a.key.localeCompare(b.key)),
    }))
    .sort((a, b) => a.section.localeCompare(b.section));
}

function formatTimestamp(timestamp?: string) {
  if (!timestamp) {
    return "未知";
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "未知";
  }
  return date.toLocaleString();
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 bg-muted/20 p-6 text-center text-sm text-muted-foreground">
      <div className="font-medium text-foreground/80">{title}</div>
      {description ? <p className="max-w-sm text-xs">{description}</p> : null}
    </div>
  );
}

function ConfigSections({ sections }: { sections: ConfigSectionGroup[] }) {
  return (
    <div className="space-y-6">
      {sections.map(({ section, entries }) => (
        <section key={section} className="rounded-lg border border-border/60">
          <header className="flex items-center justify-between border-b border-border/60 bg-muted/40 px-4 py-2">
            <h3 className="text-sm font-semibold">{section}</h3>
            <span className="text-xs text-muted-foreground">
              共 {entries.length} 项
            </span>
          </header>
          <div className="overflow-hidden">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">键</th>
                  <th className="px-4 py-2 text-left font-medium">值</th>
                  <th className="px-4 py-2 text-left font-medium">作用域</th>
                  <th className="px-4 py-2 text-left font-medium">来源</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {entries.map((entry) => (
                  <tr
                    key={entry.key}
                    className="transition hover:bg-primary/5 hover:text-foreground"
                  >
                    <td className="px-4 py-3 align-top font-medium">
                      {entry.key}
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-muted-foreground">
                      <pre className="whitespace-pre-wrap break-words">
                        {entry.value}
                      </pre>
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-muted-foreground">
                      {entry.source.scope}
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-muted-foreground">
                      <div>{entry.source.file}</div>
                      {typeof entry.source.line === "number" &&
                        entry.source.line > 0 && (
                          <div className="mt-1 text-[11px] text-muted-foreground/80">
                            行 {entry.source.line}
                          </div>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("repositories");
  const [globalConfig, setGlobalConfig] = useState<ConfigMatrix | null>(null);
  const [roots, setRoots] = useState<string[]>([]);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);
  const [configMatrix, setConfigMatrix] = useState<ConfigMatrix | null>(null);
  const [changeSets, setChangeSets] = useState<ChangeSet[]>([]);
  const [includeRules, setIncludeRules] = useState<IncludeRule[]>([]);

  const [newRulePattern, setNewRulePattern] = useState("");
  const [newRuleTarget, setNewRuleTarget] = useState("");

  const [loadingRepos, setLoadingRepos] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [loadingGlobal, setLoadingGlobal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const selectedRepository = useMemo(
    () => repositories.find((repo) => repo.id === selectedRepoId) ?? null,
    [repositories, selectedRepoId],
  );

  const configSections = useMemo(
    () => groupConfigEntries(configMatrix),
    [configMatrix],
  );

  const globalSections = useMemo(
    () => groupConfigEntries(globalConfig),
    [globalConfig],
  );

  const handleError = useCallback((err: unknown, fallbackMessage: string) => {
    console.error(err);
    const message = err instanceof Error ? err.message : fallbackMessage;
    setInfoMessage(null);
    setError(message || fallbackMessage);
  }, []);

  const refreshRepositories = useCallback(
    async (forceRefresh = false, currentRoots?: string[]) => {
      setLoadingRepos(true);
      setError(null);
      try {
        if (currentRoots && currentRoots.length === 0) {
          setRepositories([]);
          setSelectedRepoId(null);
          return;
        }
        const repos = await ScanRepositories(
          gitcfg.ScanOptions.createFrom({ forceRefresh }),
        );
        setRepositories(repos);
        if (!repos.length) {
          setSelectedRepoId(null);
          return;
        }

        const existing = repos.find((repo) => repo.id === selectedRepoId);
        const nextId = existing?.id ?? repos[0]?.id ?? null;
        setSelectedRepoId(nextId);
      } catch (err) {
        handleError(err, "扫描仓库失败");
      } finally {
        setLoadingRepos(false);
      }
    },
    [handleError, selectedRepoId],
  );

  const refreshRoots = useCallback(async () => {
    try {
      const discovered = await ListRoots();
      setRoots(discovered);
      await refreshRepositories(false, discovered);
    } catch (err) {
      handleError(err, "无法加载扫描目录列表");
    }
  }, [handleError, refreshRepositories]);

  const refreshIncludeRules = useCallback(async () => {
    try {
      const rules = await ListIncludeRules();
      setIncludeRules(rules);
    } catch (err) {
      handleError(err, "加载 includeIf 规则失败");
    }
  }, [handleError]);

  const refreshGlobalConfig = useCallback(async () => {
    setLoadingGlobal(true);
    try {
      const matrix = await GetGlobalConfig();
      setGlobalConfig(matrix);
      return true;
    } catch (err) {
      handleError(err, "加载全局配置失败");
      return false;
    } finally {
      setLoadingGlobal(false);
    }
  }, [handleError]);

  const loadRepositoryDetails = useCallback(
    async (repositoryId: string) => {
      setLoadingConfig(true);
      try {
        const [config, changes] = await Promise.all([
          GetEffectiveConfig(repositoryId),
          ListChangeSets(repositoryId),
        ]);
        setConfigMatrix(config);
        setChangeSets(changes);
      } catch (err) {
        handleError(err, "加载仓库配置失败");
      } finally {
        setLoadingConfig(false);
      }
    },
    [handleError],
  );

  const bootstrap = useCallback(async () => {
    await Promise.all([refreshRoots(), refreshIncludeRules()]);
  }, [refreshRoots, refreshIncludeRules]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (!selectedRepoId) {
      setConfigMatrix(null);
      setChangeSets([]);
      return;
    }
    void loadRepositoryDetails(selectedRepoId);
  }, [loadRepositoryDetails, selectedRepoId]);

  useEffect(() => {
    if (activeTab === "global" && !globalConfig && !loadingGlobal) {
      void refreshGlobalConfig();
    }
  }, [activeTab, globalConfig, loadingGlobal, refreshGlobalConfig]);

  const handlePickRoot = async () => {
    try {
      setError(null);
      setInfoMessage(null);
      const repo = await PickRoot();
      if (!repo || !repo.id) {
        return;
      }
      await refreshRoots();
      setInfoMessage(`已添加 ${repo.name}`);
    } catch (err) {
      handleError(err, "选择目录失败");
    }
  };

  const handleRemoveRoot = async (path: string) => {
    try {
      setError(null);
      setInfoMessage(null);
      await RemoveRoot(path);
      await refreshRoots();
      setInfoMessage("目录已移除");
    } catch (err) {
      handleError(err, "移除目录失败");
    }
  };

  const handleSelectRepository = (repositoryId: string) => {
    if (repositoryId === selectedRepoId) {
      return;
    }
    setSelectedRepoId(repositoryId);
  };

  const handleForceRefresh = async () => {
    setError(null);
    setInfoMessage(null);
    await refreshRepositories(true);
    if (selectedRepoId) {
      await loadRepositoryDetails(selectedRepoId);
    }
    setInfoMessage("仓库信息已刷新");
  };

  const handleGlobalRefresh = async () => {
    setError(null);
    setInfoMessage(null);
    const success = await refreshGlobalConfig();
    if (success) {
      setInfoMessage("全局配置已刷新");
    }
  };

  const handleTabChange = (tab: TabKey) => {
    if (tab === activeTab) {
      return;
    }
    setError(null);
    setInfoMessage(null);
    setActiveTab(tab);
  };

  const handleRuleToggle = async (rule: IncludeRule) => {
    try {
      setError(null);
      setInfoMessage(null);
      const updated = await ToggleIncludeRule(rule.id, !rule.enabled);
      setIncludeRules((rules) =>
        rules.map((item) => (item.id === updated.id ? updated : item)),
      );
      setInfoMessage("规则状态已更新");
    } catch (err) {
      handleError(err, "更新规则状态失败");
    }
  };

  const handleRuleDelete = async (ruleId: string) => {
    try {
      setError(null);
      setInfoMessage(null);
      await DeleteIncludeRule(ruleId);
      setIncludeRules((rules) => rules.filter((rule) => rule.id !== ruleId));
      setInfoMessage("规则已删除");
    } catch (err) {
      handleError(err, "删除规则失败");
    }
  };

  const handleCreateRule = async () => {
    if (!newRulePattern.trim() || !newRuleTarget.trim()) {
      return;
    }
    try {
      setError(null);
      setInfoMessage(null);
      const ruleModel = gitcfg.IncludeRule.createFrom({
        id: "",
        pattern: newRulePattern.trim(),
        targetPath: newRuleTarget.trim(),
        enabled: true,
        conflicts: [],
        lastUpdated: "",
      });
      const rule: IncludeRule = await UpsertIncludeRule(ruleModel);
      setIncludeRules((rules) => [...rules, rule]);
      setNewRulePattern("");
      setNewRuleTarget("");
      setInfoMessage("规则已保存");
    } catch (err) {
      handleError(err, "保存规则失败");
    }
  };

  const latestChange = changeSets[0];
  const canCreateRule =
    Boolean(newRulePattern.trim()) && Boolean(newRuleTarget.trim());

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3 text-lg font-semibold">
            <Disc3 className="h-5 w-5 text-primary" />
            <span>Git Config Manager</span>
          </div>
          <div className="flex items-center gap-2">
            {activeTab === "repositories" && (
              <Button
                onClick={handleForceRefresh}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                刷新
              </Button>
            )}
          </div>
        </div>
      </header>

      <Tabs
        value={activeTab}
        onValueChange={(value) => handleTabChange(value as TabKey)}
        className="flex flex-1 flex-col"
      >
        <div className="border-b border-border/60 bg-background/60">
          <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between px-6 pb-2 pt-4">
            <TabsList className="bg-muted/40">
              <TabsTrigger value="global">全局配置</TabsTrigger>
              <TabsTrigger value="repositories">仓库</TabsTrigger>
            </TabsList>
            {loadingRepos && activeTab === "repositories" && (
              <Badge variant="info" className="gap-2">
                <LoaderCircle className="h-3 w-3 animate-spin" />
                正在扫描
              </Badge>
            )}
            {loadingGlobal && activeTab === "global" && (
              <Badge variant="info" className="gap-2">
                <LoaderCircle className="h-3 w-3 animate-spin" />
                正在加载
              </Badge>
            )}
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-[1200px] flex-col flex-1 overflow-hidden px-6 pb-8 pt-4">
          <div className="min-h-[36px]">
            {error && (
              <div className="flex items-center gap-3 rounded-md border border-destructive/40 bg-destructive/15 px-4 py-3 text-sm text-destructive-foreground">
                <span className="font-medium">错误：</span>
                <span>{error}</span>
              </div>
            )}
            {!error && infoMessage && (
              <div className="flex items-center gap-3 rounded-md border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-primary-foreground">
                <span className="font-medium">提示：</span>
                <span>{infoMessage}</span>
              </div>
            )}
          </div>

          <TabsContent
            value="global"
            className="flex flex-1 flex-col overflow-hidden"
          >
            <Card className="flex h-full flex-col">
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div className="space-y-1">
                  <CardTitle>全局配置</CardTitle>
                  <CardDescription>
                    查看系统范围和用户级别的 Git 设置
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleGlobalRefresh}
                    variant="outline"
                    size="sm"
                    className="gap-2"
                  >
                    <RefreshCw className="h-4 w-4" />
                    刷新
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="flex-1 overflow-hidden">
                {globalSections.length ? (
                  <ScrollArea className="h-full pr-2">
                    <ConfigSections sections={globalSections} />
                  </ScrollArea>
                ) : (
                  <EmptyState
                    title="尚未读取到全局配置"
                    description="点击右上角的“刷新”以从本地环境中获取最新的 git config 数据。"
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent
            value="repositories"
            className="flex flex-1 flex-col overflow-hidden"
          >
            <div className="grid flex-1 gap-4 overflow-hidden lg:grid-cols-[320px_1fr]">
              <div className="flex flex-col gap-4 overflow-hidden">
                <Card className="flex h-full flex-col">
                  <CardHeader className="space-y-2">
                    <div className="flex items-center justify-between">
                      <CardTitle>扫描目录</CardTitle>
                      <Button
                        onClick={handlePickRoot}
                        size="sm"
                        className="gap-2"
                      >
                        <FolderOpen className="h-4 w-4" />
                        选择目录
                      </Button>
                    </div>
                    <CardDescription>
                      从 Finder 中选择包含 Git 仓库的目录。
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1 overflow-hidden">
                    {roots.length ? (
                      <ScrollArea className="h-full pr-2">
                        <ul className="space-y-2 text-sm">
                          {roots.map((root) => (
                            <li
                              key={root}
                              className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2"
                            >
                              <span
                                className="flex-1 truncate text-muted-foreground"
                                title={root}
                              >
                                {root}
                              </span>
                              <Button
                                onClick={() => handleRemoveRoot(root)}
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="text-muted-foreground transition hover:text-destructive"
                                aria-label={`移除 ${root}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </li>
                          ))}
                        </ul>
                      </ScrollArea>
                    ) : (
                      <EmptyState
                        title="尚未添加目录"
                        description="添加一个根目录以开始扫描仓库。"
                      />
                    )}
                  </CardContent>
                </Card>

                <Card className="flex h-full flex-col">
                  <CardHeader className="space-y-2">
                    <CardTitle>includeIf 规则</CardTitle>
                    <CardDescription>
                      自动为匹配的仓库加载额外配置文件。
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1 space-y-4 overflow-hidden">
                    <div className="space-y-2 rounded-lg border border-dashed border-border/60 bg-muted/30 p-4">
                      <div className="space-y-2">
                        <Input
                          value={newRulePattern}
                          placeholder="gitdir:~/projects/*"
                          onChange={(event) =>
                            setNewRulePattern(event.target.value)
                          }
                        />
                        <Input
                          value={newRuleTarget}
                          placeholder="配置文件路径，例如 ~/.gitconfig-work"
                          onChange={(event) =>
                            setNewRuleTarget(event.target.value)
                          }
                        />
                      </div>
                      <Button
                        onClick={handleCreateRule}
                        type="button"
                        size="sm"
                        className="gap-2"
                        disabled={!canCreateRule}
                      >
                        保存规则
                      </Button>
                    </div>
                    {includeRules.length ? (
                      <ScrollArea className="h-full pr-2">
                        <ul className="space-y-3 text-sm">
                          {includeRules.map((rule) => (
                            <li
                              key={rule.id}
                              className={cn(
                                "space-y-2 rounded-lg border border-border/60 bg-muted/30 p-3 transition",
                                !rule.enabled && "opacity-60",
                              )}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-sm font-semibold">
                                    {rule.pattern}
                                  </div>
                                  <div className="mt-1 text-xs text-muted-foreground">
                                    {rule.targetPath}
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    onClick={() => handleRuleToggle(rule)}
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className={cn(
                                      "text-muted-foreground",
                                      rule.enabled
                                        ? "hover:text-emerald-400"
                                        : "hover:text-foreground",
                                    )}
                                    aria-label={rule.enabled ? "禁用规则" : "启用规则"}
                                  >
                                    <Power className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    onClick={() => handleRuleDelete(rule.id)}
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="text-muted-foreground transition hover:text-destructive"
                                    aria-label="删除规则"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                              {rule.conflicts?.length ? (
                                <ul className="space-y-1 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive-foreground">
                                  {rule.conflicts.map((conflict) => (
                                    <li key={conflict.ruleId}>{conflict.reason}</li>
                                  ))}
                                </ul>
                              ) : null}
                              <div className="text-[11px] text-muted-foreground/70">
                                最近更新：{formatTimestamp(rule.lastUpdated)}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </ScrollArea>
                    ) : (
                      <EmptyState
                        title="尚未定义 includeIf 规则"
                        description="添加规则以根据仓库路径自动加载额外配置。"
                      />
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="flex flex-col gap-4 overflow-hidden">
                <Card className="flex h-full flex-col">
                  <CardHeader className="flex flex-row items-start justify-between space-y-0">
                    <div className="space-y-1">
                      <CardTitle>仓库</CardTitle>
                      <CardDescription>
                        已检测到 {repositories.length} 个仓库
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 overflow-hidden">
                    {repositories.length ? (
                      <ScrollArea className="h-full pr-2">
                        <div className="space-y-2">
                          {repositories.map((repo) => {
                            const isSelected = repo.id === selectedRepoId;
                            return (
                              <div
                                key={repo.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => handleSelectRepository(repo.id)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    handleSelectRepository(repo.id);
                                  }
                                }}
                                className={cn(
                                  "cursor-pointer rounded-lg border border-transparent bg-muted/30 p-4 text-sm shadow-sm transition hover:border-primary/50 hover:bg-primary/10",
                                  isSelected
                                    ? "border-primary/70 bg-primary/15 shadow"
                                    : "border-border/40",
                                )}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-semibold">
                                    {repo.name}
                                  </span>
                                  <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] uppercase tracking-tight text-primary-foreground/80">
                                    {repo.status || "未知"}
                                  </span>
                                </div>
                                <div className="mt-1 truncate text-xs text-muted-foreground">
                                  {repo.path}
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground/80">
                                  {repo.isWorktree && (
                                    <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-sky-200">
                                      worktree
                                    </span>
                                  )}
                                  {repo.isSubmodule && (
                                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-200">
                                      submodule
                                    </span>
                                  )}
                                  {repo.isBare && (
                                    <span className="rounded-full bg-purple-500/15 px-2 py-0.5 text-purple-200">
                                      bare
                                    </span>
                                  )}
                                  <span>
                                    上次扫描：{formatTimestamp(repo.lastScanTime)}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    ) : (
                      <EmptyState
                        title="未检测到仓库"
                        description="请先添加扫描目录，或点击顶部的“刷新”重新扫描。"
                      />
                    )}
                  </CardContent>
                </Card>

                <Card className="flex h-full flex-col">
                  <CardHeader className="flex flex-row items-start justify-between space-y-0">
                    <div className="space-y-1">
                      <CardTitle>配置总览</CardTitle>
                      <CardDescription>
                        {selectedRepository
                          ? `展示 ${selectedRepository.name} 的有效 Git 配置`
                          : "选择一个仓库以查看配置"}
                      </CardDescription>
                    </div>
                    {loadingConfig && (
                      <Badge variant="info" className="gap-2">
                        <LoaderCircle className="h-3 w-3 animate-spin" />
                        加载配置…
                      </Badge>
                    )}
                  </CardHeader>
                  <CardContent className="flex-1 overflow-hidden">
                    {configSections.length ? (
                      <ScrollArea className="h-full pr-2">
                        <ConfigSections sections={configSections} />
                      </ScrollArea>
                    ) : (
                      <EmptyState
                        title={
                          selectedRepository
                            ? "该仓库暂无配置数据"
                            : "请选择一个仓库以查看配置"
                        }
                        description={
                          selectedRepository
                            ? "该仓库可能沿用全局配置，或尚未读取到配置文件。"
                            : undefined
                        }
                      />
                    )}
                  </CardContent>
                </Card>

                {latestChange ? (
                  <Card className="flex flex-col">
                    <CardHeader className="flex flex-row items-start justify-between space-y-0">
                      <div className="space-y-1">
                        <CardTitle>最近变更</CardTitle>
                        <CardDescription>
                          回顾最近一次写入或模拟结果
                        </CardDescription>
                      </div>
                      <Badge variant="outline" className="gap-1">
                        <Clock3 className="h-3 w-3" />
                        {formatTimestamp(latestChange.createdAt)}
                      </Badge>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <FileDiff className="h-3.5 w-3.5" />
                          {latestChange.filePath || "未知路径"}
                        </span>
                        <span>作用域：{latestChange.scope}</span>
                      </div>
                      <ScrollArea className="h-48 rounded-md border border-border/60 bg-muted/25">
                        <pre className="whitespace-pre-wrap break-words px-4 py-3 text-xs leading-6">
                          {latestChange.diff}
                        </pre>
                      </ScrollArea>
                    </CardContent>
                    <CardFooter className="flex items-center gap-2">
                      <Button
                        onClick={async () => {
                          try {
                            const reverted = await Rollback(latestChange.id);
                            setInfoMessage(`已准备回滚 ${reverted.id}`);
                          } catch (err) {
                            handleError(err, "回滚失败");
                          }
                        }}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-2"
                      >
                        <Undo2 className="h-4 w-4" />
                        回滚
                      </Button>
                      <Button
                        onClick={async () => {
                          try {
                            const updated = await WriteConfig(
                              gitcfg.WriteRequest.createFrom({
                                repositoryId: latestChange.repositoryId,
                                scope: latestChange.scope,
                                key: "user.name",
                                value: "Updated User",
                                targetPath: latestChange.filePath,
                                dryRun: true,
                              }),
                            );
                            setInfoMessage(`已生成变更 ${updated.id}`);
                          } catch (err) {
                            handleError(err, "写入配置失败");
                          }
                        }}
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="gap-2"
                      >
                        模拟写入
                      </Button>
                    </CardFooter>
                  </Card>
                ) : null}
              </div>
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

export default App;
