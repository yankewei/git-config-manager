export namespace gitcfg {
	
	export class ChangeSet {
	    id: string;
	    repositoryId: string;
	    scope: string;
	    filePath: string;
	    diff: string;
	    backupPath: string;
	    createdAt: string;
	
	    static createFrom(source: any = {}) {
	        return new ChangeSet(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.repositoryId = source["repositoryId"];
	        this.scope = source["scope"];
	        this.filePath = source["filePath"];
	        this.diff = source["diff"];
	        this.backupPath = source["backupPath"];
	        this.createdAt = source["createdAt"];
	    }
	}
	export class ConfigOverride {
	    value: string;
	    source: ConfigSource;
	    timestamp: string;
	
	    static createFrom(source: any = {}) {
	        return new ConfigOverride(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.value = source["value"];
	        this.source = this.convertValues(source["source"], ConfigSource);
	        this.timestamp = source["timestamp"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ConfigSource {
	    scope: string;
	    file?: string;
	    line?: number;
	
	    static createFrom(source: any = {}) {
	        return new ConfigSource(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.scope = source["scope"];
	        this.file = source["file"];
	        this.line = source["line"];
	    }
	}
	export class ConfigValue {
	    key: string;
	    value: string;
	    source: ConfigSource;
	    overrides?: ConfigOverride[];
	    lastModified: string;
	
	    static createFrom(source: any = {}) {
	        return new ConfigValue(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.key = source["key"];
	        this.value = source["value"];
	        this.source = this.convertValues(source["source"], ConfigSource);
	        this.overrides = this.convertValues(source["overrides"], ConfigOverride);
	        this.lastModified = source["lastModified"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ConfigMatrix {
	    repositoryId: string;
	    entries: Record<string, ConfigValue>;
	    retrievedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new ConfigMatrix(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.repositoryId = source["repositoryId"];
	        this.entries = this.convertValues(source["entries"], ConfigValue, true);
	        this.retrievedAt = source["retrievedAt"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	
	export class DiagnosticIssue {
	    severity: string;
	    message: string;
	    suggestion?: string;
	    relatedFile?: string;
	
	    static createFrom(source: any = {}) {
	        return new DiagnosticIssue(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.severity = source["severity"];
	        this.message = source["message"];
	        this.suggestion = source["suggestion"];
	        this.relatedFile = source["relatedFile"];
	    }
	}
	export class DiagnosticsReport {
	    repositoryId: string;
	    checkedAt: string;
	    issues?: DiagnosticIssue[];
	
	    static createFrom(source: any = {}) {
	        return new DiagnosticsReport(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.repositoryId = source["repositoryId"];
	        this.checkedAt = source["checkedAt"];
	        this.issues = this.convertValues(source["issues"], DiagnosticIssue);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class RuleConflict {
	    ruleId: string;
	    reason: string;
	
	    static createFrom(source: any = {}) {
	        return new RuleConflict(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ruleId = source["ruleId"];
	        this.reason = source["reason"];
	    }
	}
	export class IncludeRule {
	    id: string;
	    pattern: string;
	    targetPath: string;
	    enabled: boolean;
	    conflicts?: RuleConflict[];
	    lastUpdated: string;
	
	    static createFrom(source: any = {}) {
	        return new IncludeRule(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.pattern = source["pattern"];
	        this.targetPath = source["targetPath"];
	        this.enabled = source["enabled"];
	        this.conflicts = this.convertValues(source["conflicts"], RuleConflict);
	        this.lastUpdated = source["lastUpdated"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Repository {
	    id: string;
	    name: string;
	    path: string;
	    root: string;
	    type: string;
	    parentId?: string;
	    isBare: boolean;
	    isWorktree: boolean;
	    isSubmodule: boolean;
	    gitDir: string;
	    lastScanTime: string;
	    status: string;
	
	    static createFrom(source: any = {}) {
	        return new Repository(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.path = source["path"];
	        this.root = source["root"];
	        this.type = source["type"];
	        this.parentId = source["parentId"];
	        this.isBare = source["isBare"];
	        this.isWorktree = source["isWorktree"];
	        this.isSubmodule = source["isSubmodule"];
	        this.gitDir = source["gitDir"];
	        this.lastScanTime = source["lastScanTime"];
	        this.status = source["status"];
	    }
	}
	
	export class ScanOptions {
	    forceRefresh: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ScanOptions(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.forceRefresh = source["forceRefresh"];
	    }
	}
	export class WriteRequest {
	    repositoryId: string;
	    scope: string;
	    key: string;
	    value: string;
	    targetPath?: string;
	    dryRun: boolean;
	
	    static createFrom(source: any = {}) {
	        return new WriteRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.repositoryId = source["repositoryId"];
	        this.scope = source["scope"];
	        this.key = source["key"];
	        this.value = source["value"];
	        this.targetPath = source["targetPath"];
	        this.dryRun = source["dryRun"];
	    }
	}

}

