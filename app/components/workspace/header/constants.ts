import packageMetadata from '@/package.json';

const { repository } = packageMetadata;
export const REPOSITORY_URL = repository.url;
export const SAVE_SHORTCUT_LABEL = '⌃s / ⌘s';
export const SAVE_KEY_SHORTCUTS = 'Control+s Meta+s';

export const HEADER_LABELS = {
  title: 'm2rd',
  sidebar: 'Toggle saved graphs',
  repository: 'GitHub repository',
  create: 'New',
  delete: 'Delete',
  download: 'Download',
  graphNameAndSave: 'Graph name and save',
};
