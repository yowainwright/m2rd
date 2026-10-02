export type WorkspacePanelsProps = {
  isDesktop: boolean;
  isLayoutReady: boolean;
  panelMinimumSize: string;
  panelOrientation: 'horizontal' | 'vertical';
};

export type ErrorDetailsProps = { error: string; source: string | null };
export type ErrorSourceProps = { source: string; line: number };
export type ErrorSourceLineProps = { text: string; number: number; active: boolean };
