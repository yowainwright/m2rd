import { viewerSetup } from './utils';

export const VIEWER_MACHINE = viewerSetup.createMachine({
  id: 'terminalViewer',
  context: ({ input }) => input,
  initial: 'viewing',
  on: {
    scroll: { actions: 'scroll' },
    resize: { actions: 'resize' },
    home: { actions: 'home' },
    end: { actions: 'end' },
    quit: { target: '.closed' },
  },
  states: {
    viewing: {
      on: {
        save: { guard: 'canSave', target: 'saving' },
        previous: { guard: 'canPrevious', actions: 'previous' },
        next: { guard: 'canNext', actions: 'next' },
      },
    },
    saving: {
      entry: 'saving',
      on: { quit: { actions: 'waitForSave' } },
      invoke: {
        src: 'saveSvg',
        input: ({ context }) => context,
        onDone: { target: 'viewing', actions: 'saved' },
        onError: {
          target: 'viewing',
          actions: {
            type: 'saveFailed',
            params: ({ event }: { event: { error: unknown } }) => event.error,
          },
        },
      },
    },
    closed: { type: 'final' },
  },
});
