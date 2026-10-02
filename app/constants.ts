import { DEFAULT_SETTINGS, EMPTY_ELEMENTS } from '@/app/graph/constants';
import type { AppContext } from './types';
export { DEFAULT_SETTINGS, EMPTY_ELEMENTS } from '@/app/graph/constants';

export const DEFAULT_SOURCE = `sequenceDiagram
    autonumber
    actor User
    participant Pre as pre
    participant Project as Project files
    participant OSV
    participant Manager

    User->>Pre: Install command via shell hook

    rect rgba(137, 180, 250, 0.18)
        Pre->>Project: Read exact lockfile versions
        alt No usable lockfile
            Pre->>Project: Read manifest requirements
        end
    end

    rect rgba(203, 166, 247, 0.18)
        Pre->>Pre: Reuse trusted cache entries
        opt Uncached packages
            Pre->>OSV: Query missing names and versions as one batch
            OSV-->>Pre: Findings or scan errors
        end
    end

    rect rgba(243, 139, 168, 0.18)
        alt Scan error
            Pre-->>User: Block command
        else Vulnerability found
            Pre-->>User: Show table and ask once
        else Clean
            Pre-->>User: Show table and ask once
        end
    end

    opt Approved
        Pre->>Manager: Run original command
        Manager-->>Pre: Return exit status
        Pre-->>User: Return result
    end
`;

export const INITIAL_UPDATED_AT = '1970-01-01T00:00:00.000Z';
export const FLOWCHART_SOURCE = `flowchart LR
    Source[Write Mermaid] --> Render[Build graph]
    Render --> Preview[React Flow preview]
`;
export const STATE_SOURCE = `stateDiagram-v2
    [*] --> booting
    booting --> rendering: initialize / render needed or error
    booting --> ready: initialize / saved layout available
    state active {
        [*] --> ready
        ready --> rendering: input.update
        rendering --> ready: render done or error
        ready --> saving: workspace.save
        saving --> saved: save done / current draft
        saving --> recover: save done / draft changed
        saving --> rendering: save error / render needed
        saving --> ready: save error / no render needed
        saved --> ready: savedFeedback
        recover --> rendering: render needed
        recover --> ready: no render needed
    }
`;
export const CLASS_SOURCE = `classDiagram
    direction LR
    class DoublyLinkedList~T~ {
        -ListNode~T~ head
        -ListNode~T~ tail
        +append(T value) void
        +prepend(T value) void
        +remove(ListNode~T~ node) void
    }
    class ListNode~T~ {
        +T value
        +ListNode~T~ prev
        +ListNode~T~ next
    }
    DoublyLinkedList "1" *-- "0..*" ListNode : owns
    ListNode "0..1" --> "0..1" ListNode : prev / next
`;
export const ER_SOURCE = `erDiagram
    direction LR
    CUSTOMER ||..o{ ORDER : places
    ORDER ||--|{ ORDER_ITEM : contains
    CUSTOMER {
        int id PK
        string email UK
    }
    ORDER {
        int id PK
        int customer_id FK
    }
    ORDER_ITEM {
        int order_id PK, FK
        int line_number PK
        string description "Purchased item"
    }`;

export const GANTT_SOURCE = `gantt
    title Release schedule
    dateFormat YYYY-MM-DD
    excludes weekends
    todayMarker off
    section Delivery
    Build :done, build, 2026-09-21, 3d
    Review :active, crit, review, after build, 2d
    Ship :milestone, ship, after review, 0d
    section Follow-up
    Documentation :docs, after ship, 2d`;

export const GRAPH_SAMPLES = {
  sequence: { label: 'Sequence', source: DEFAULT_SOURCE, diagramType: 'sequence' },
  flowchart: { label: 'Flowchart', source: FLOWCHART_SOURCE, diagramType: 'flowchart' },
  stateDiagram: { label: 'State diagram', source: STATE_SOURCE, diagramType: 'stateDiagram' },
  classDiagram: { label: 'Class diagram', source: CLASS_SOURCE, diagramType: 'classDiagram' },
  er: { label: 'ER diagram', source: ER_SOURCE, diagramType: 'er' },
  gantt: { label: 'Gantt chart', source: GANTT_SOURCE, diagramType: 'gantt' },
} as const;
export const LOCAL_WORKSPACE_ID = 'workspace-local';
export const DESKTOP_MEDIA_QUERY = '(min-width: 1024px)';

export const SAVE_FEEDBACK_MS = 1400;
export const EDGE_ANCHOR_STYLE = { pointerEvents: 'all' } as const;
export const GRAPH_NAME_LABEL = 'Graph name';
export const RENAME_GRAPH_LABEL = 'Rename graph';
export const GRAPH_NAME_ERROR_ID = 'graph-name-error';

export const APP_INITIAL_CONTEXT: AppContext = {
  isDesktop: null,
  sidebarOpen: true,
  versionHistoryOpen: true,
  toolkitOpen: false,
  canvasRevision: 0,
  needsRender: true,
  resetLayout: false,
  errorDialogDismissed: false,
  operationError: null,
  titleDraft: '',
  titleError: null,
  afterRename: null,
  exportError: null,
  loadRequest: null,
  exportRequest: { format: 'svg', repeat: 'forever' },
  workspaces: [],
  versions: [],
  workspace: {
    id: LOCAL_WORKSPACE_ID,
    name: '',
    activeInputId: 'input-local',
    activeTranslationId: 'translation-local',
    updatedAt: INITIAL_UPDATED_AT,
  },
  input: {
    id: 'input-local',
    workspaceId: 'workspace-local',
    format: 'mermaid' as const,
    source: DEFAULT_SOURCE,
    updatedAt: INITIAL_UPDATED_AT,
    version: 0,
  },
  translation: {
    diagramType: 'sequence',
    id: 'translation-local',
    inputId: 'input-local',
    elements: EMPTY_ELEMENTS,
    settings: DEFAULT_SETTINGS,
    view: {},
    error: null,
    updatedAt: INITIAL_UPDATED_AT,
  },
};
