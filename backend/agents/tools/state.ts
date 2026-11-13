export interface AgentState {
    sources: { url: string; index: number }[];
    generatedFiles: any[];
    thoughtProcess: any[];
    searchContent?: string;
    searchCount: number;
    wikiSearchCount: number;
    weatherDone?: boolean;
}

