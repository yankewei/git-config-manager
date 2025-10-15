import { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";
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

type Repository = gitcfg.Repository;
type ConfigMatrix = gitcfg.ConfigMatrix;
type IncludeRule = gitcfg.IncludeRule;
type ChangeSet = gitcfg.ChangeSet;
type TabKey = "global" | "repositories";

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

  const configEntries = useMemo(() => {
    if (!configMatrix) {
      return [];
    }
    const entries = Object.values(configMatrix.entries ?? {});
    entries.sort((a, b) => a.key.localeCompare(b.key));
    return entries;
  }, [configMatrix]);

  const globalEntries = useMemo(() => {
    if (!globalConfig) {
      return [];
    }
    const entries = Object.values(globalConfig.entries ?? {});
    entries.sort((a, b) => a.key.localeCompare(b.key));
    return entries;
  }, [globalConfig]);

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
    bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (!selectedRepoId) {
      setConfigMatrix(null);
      setChangeSets([]);
      return;
    }
    loadRepositoryDetails(selectedRepoId);
  }, [loadRepositoryDetails, selectedRepoId]);

  useEffect(() => {
    if (activeTab === "global" && !globalConfig && !loadingGlobal) {
      refreshGlobalConfig();
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

  return (
    <div className="app-container">
      <header className="toolbar">
        <div className="title">Git Config Manager</div>
        <div className="toolbar-actions">
          {activeTab === "repositories" && (
            <button
              className="action-button"
              onClick={handleForceRefresh}
              type="button"
            >
              刷新
            </button>
          )}
        </div>
      </header>
      <div className="tab-bar">
        <button
          className={`tab-button${activeTab === "global" ? " active" : ""}`}
          onClick={() => handleTabChange("global")}
          type="button"
        >
          全局配置
        </button>
        <button
          className={`tab-button${
            activeTab === "repositories" ? " active" : ""
          }`}
          onClick={() => handleTabChange("repositories")}
          type="button"
        >
          仓库
        </button>
      </div>
      <div className="feedback-panel">
        {error && (
          <div className="feedback feedback-error" role="alert">
            {error}
          </div>
        )}
        {!error && infoMessage && (
          <div className="feedback feedback-info">{infoMessage}</div>
        )}
      </div>
      <div className={`content ${activeTab === "global" ? "content-global" : ""}`}>
        {activeTab === "global" ? (
          <main className="main-content global-main">
            <section className="panel">
              <header className="panel-header">
                <h2>全局配置</h2>
                <div className="panel-actions">
                  {loadingGlobal && (
                    <span className="status-indicator">加载中…</span>
                  )}
                  <button
                    className="action-button"
                    onClick={handleGlobalRefresh}
                    type="button"
                  >
                    刷新
                  </button>
                </div>
              </header>
              <div className="panel-body config-grid">
                {globalEntries.length ? (
                  <table>
                    <thead>
                      <tr>
                        <th>键</th>
                        <th>值</th>
                        <th>作用域</th>
                        <th>来源</th>
                      </tr>
                    </thead>
                    <tbody>
                      {globalEntries.map((entry) => (
                        <tr key={entry.key}>
                          <td>{entry.key}</td>
                          <td>{entry.value}</td>
                          <td>{entry.source.scope}</td>
                          <td>
                            <div>{entry.source.file}</div>
                            {typeof entry.source.line === "number" &&
                              entry.source.line > 0 && (
                              <div>行 {entry.source.line}</div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="empty-state">尚未读取到全局配置</div>
                )}
              </div>
            </section>
          </main>
        ) : (
          <>
            <aside className="sidebar">
              <section className="panel">
                <header className="panel-header">
                  <h2>扫描目录</h2>
                </header>
                <div className="panel-body">
                  <div className="add-root single">
                    <button onClick={handlePickRoot} type="button">
                      选择目录
                    </button>
                    <span className="helper-text">从 Finder 中选择一个 Git 仓库</span>
                  </div>
                  <ul className="root-list">
                    {roots.map((root) => (
                      <li key={root}>
                        <span title={root}>{root}</span>
                        <button onClick={() => handleRemoveRoot(root)} type="button">
                          移除
                        </button>
                      </li>
                    ))}
                    {!roots.length && <div className="empty-state">尚未添加目录</div>}
                  </ul>
                </div>
              </section>
              <section className="panel">
                <header className="panel-header">
                  <h2>includeIf 规则</h2>
                </header>
                <div className="panel-body">
                  <div className="add-rule">
                    <input
                      value={newRulePattern}
                      placeholder="gitdir:~/projects/*"
                      onChange={(event) => setNewRulePattern(event.target.value)}
                    />
                    <input
                      value={newRuleTarget}
                      placeholder="配置文件路径"
                      onChange={(event) => setNewRuleTarget(event.target.value)}
                    />
                    <button onClick={handleCreateRule} type="button">
                      保存
                    </button>
                  </div>
                  <ul className="rule-list">
                    {includeRules.map((rule) => (
                      <li key={rule.id} className={rule.enabled ? "" : "disabled"}>
                        <div className="rule-info">
                          <div className="rule-pattern">{rule.pattern}</div>
                          <div className="rule-target">{rule.targetPath}</div>
                        </div>
                        <div className="rule-actions">
                          <button onClick={() => handleRuleToggle(rule)} type="button">
                            {rule.enabled ? "禁用" : "启用"}
                          </button>
                          <button onClick={() => handleRuleDelete(rule.id)} type="button">
                            删除
                          </button>
                        </div>
                        {rule.conflicts?.length ? (
                          <ul className="conflict-list">
                            {rule.conflicts.map((conflict) => (
                              <li key={conflict.ruleId}>{conflict.reason}</li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    ))}
                    {!includeRules.length && (
                      <div className="empty-state">尚未定义 includeIf 规则</div>
                    )}
                  </ul>
                </div>
              </section>
            </aside>
            <main className="main-content">
              <section className="panel">
                <header className="panel-header">
                  <h2>仓库</h2>
                  {loadingRepos && <span className="status-indicator">扫描中…</span>}
                </header>
                <div className="panel-body">
                  <ul className="repo-list">
                    {repositories.map((repo) => (
                      <li
                        key={repo.id}
                        className={repo.id === selectedRepoId ? "selected" : ""}
                        onClick={() => handleSelectRepository(repo.id)}
                      >
                        <div className="repo-name">{repo.name}</div>
                        <div className="repo-path" title={repo.path}>
                          {repo.path}
                        </div>
                        <div className="repo-meta">
                          <span>{repo.type}</span>
                          <span>
                            {repo.lastScanTime
                              ? new Date(repo.lastScanTime).toLocaleString()
                              : "未扫描"}
                          </span>
                        </div>
                      </li>
                    ))}
                    {!repositories.length && (
                      <div className="empty-state">
                        未检测到仓库。请添加扫描目录。
                      </div>
                    )}
                  </ul>
                </div>
              </section>
              <section className="panel">
                <header className="panel-header">
                  <h2>配置总览</h2>
                  {loadingConfig && (
                    <span className="status-indicator">加载配置…</span>
                  )}
                </header>
                <div className="panel-body config-grid">
                  {configEntries.length ? (
                    <table>
                      <thead>
                        <tr>
                          <th>键</th>
                          <th>值</th>
                          <th>作用域</th>
                          <th>来源</th>
                        </tr>
                      </thead>
                      <tbody>
                        {configEntries.map((entry) => (
                          <tr key={entry.key}>
                            <td>{entry.key}</td>
                            <td>{entry.value}</td>
                            <td>{entry.source.scope}</td>
                            <td>
                              <div>{entry.source.file}</div>
                              {typeof entry.source.line === "number" &&
                                entry.source.line > 0 && (
                                <div>行 {entry.source.line}</div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="empty-state">
                      {selectedRepository
                        ? "该仓库暂无配置数据"
                        : "请选择一个仓库以查看配置"}
                    </div>
                  )}
                </div>
              </section>
              {latestChange && (
                <section className="panel">
                  <header className="panel-header">
                    <h2>最近变更</h2>
                  </header>
                  <div className="panel-body change-panel">
                    <div>
                      <div className="change-meta">
                        <span>作用域：{latestChange.scope}</span>
                        <span>
                          时间：
                          {latestChange.createdAt
                            ? new Date(latestChange.createdAt).toLocaleString()
                            : "未知"}
                        </span>
                      </div>
                      <pre className="change-diff">{latestChange.diff}</pre>
                    </div>
                    <div className="change-actions">
                      <button
                        onClick={async () => {
                          try {
                            const reverted = await Rollback(latestChange.id);
                            setInfoMessage(`已准备回滚 ${reverted.id}`);
                          } catch (err) {
                            handleError(err, "回滚失败");
                          }
                        }}
                        type="button"
                      >
                        回滚
                      </button>
                      <button
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
                      >
                        模拟写入
                      </button>
                    </div>
                  </div>
                </section>
              )}
            </main>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
