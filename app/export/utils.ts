import { applyPalette, GIFEncoder, quantize } from 'gifenc';
import { toCanvas, toPng, toSvg } from 'html-to-image';
import {
  GRAPH_EXPORT_SELECTOR,
  GIF_FILE_EXTENSION,
  GIF_FRAME_COUNT,
  GIF_FRAME_DELAY_MS,
  GIF_MAX_COLORS,
  GIF_REPEAT_FOREVER,
  GIF_REPEAT_ONCE,
  GIF_TYPE,
  PNG_FILE_EXTENSION,
  SVG_FILE_EXTENSION,
  SVG_FILE_FALLBACK_NAME,
} from './constants';
import type { GifExportInput, GraphExportResult, PngExportInput, SvgExportInput } from './types';

const invalidFileNamePattern = /[^a-z0-9-_]+/gi;

const duplicateDashPattern = /-+/g;

const exportOptions = {
  cacheBust: true,
  filter: shouldExportNode,
};

const svgDataUrlPrefix = 'data:image/svg+xml;charset=utf-8,';

export const getSvgExportElement = () => {
  return document.querySelector<HTMLElement>(GRAPH_EXPORT_SELECTOR);
};

export const exportGif = async (input: GifExportInput): Promise<GraphExportResult> => {
  const fileName = createFileName(input.name, GIF_FILE_EXTENSION);
  const frames = await captureGifFrames(input.element);
  const blob = createGifBlob(frames, input.repeat);

  downloadBlob(blob, fileName);

  return { fileName };
};

export const exportPng = async (input: PngExportInput): Promise<GraphExportResult> => {
  const fileName = createFileName(input.name, PNG_FILE_EXTENSION);
  const dataUrl = await toPngDataUrl(input.element);

  downloadDataUrl(dataUrl, fileName);

  return { fileName };
};

export const exportSvg = async (input: SvgExportInput): Promise<GraphExportResult> => {
  const fileName = createFileName(input.name, SVG_FILE_EXTENSION);
  const dataUrl = await toSvgDataUrl(input.element);

  downloadDataUrl(dataUrl, fileName);

  return { fileName };
};

export const captureSvg = async (element: HTMLElement): Promise<string> => {
  await element.ownerDocument.fonts?.ready;
  element.getBoundingClientRect();
  const animations = element.getAnimations?.({ subtree: true }) ?? [];
  const running = animations.filter((animation) => animation.playState === 'running');
  running.forEach((animation) => animation.pause());
  try {
    const dataUrl = await toSvgDataUrl(element);
    return getStaticSvg(dataUrl, element);
  } finally {
    running.forEach((animation) => animation.play());
  }
};

const getStaticSvg = (dataUrl: string, original: HTMLElement) => {
  if (!dataUrl.startsWith(svgDataUrlPrefix)) throw new Error('Unable to capture graph SVG.');
  const svg = decodeURIComponent(dataUrl.slice(svgDataUrlPrefix.length));
  const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const clonedPaths = document.querySelectorAll('.react-flow__edge-path');
  const originalPaths = original.querySelectorAll('.react-flow__edge-path');
  clonedPaths.forEach((path, index) => copyEdgeFrame(path, originalPaths[index]));
  document.querySelectorAll('[style]').forEach(disableAnimations);
  return new XMLSerializer().serializeToString(document);
};

const copyEdgeFrame = (path: Element, original?: Element) => {
  const canCopy = path instanceof SVGElement && original;
  if (!canCopy) return;
  const computed = getComputedStyle(original);
  path.style.strokeDashoffset = computed.strokeDashoffset;
  path.style.strokeDasharray = computed.strokeDasharray;
  path.style.strokeOpacity = computed.strokeOpacity;
  path.style.opacity = computed.opacity;
};

const disableAnimations = (element: Element) => {
  const styled = element instanceof HTMLElement || element instanceof SVGElement;
  if (!styled) return;
  const { style } = element;
  const animated = style.animationName && style.animationName !== 'none';
  if (animated) style.animationName = 'none';
  const transitioning = style.transitionProperty && style.transitionProperty !== 'none';
  if (transitioning) style.transitionProperty = 'none';
};

function shouldExportNode(node: Node) {
  if (!(node instanceof Element)) {
    return true;
  }

  return node.closest('[data-m2rd-export-ignore="true"]') === null;
}

const downloadDataUrl = (dataUrl: string, fileName: string) => {
  const link = document.createElement('a');

  link.download = fileName;
  link.href = dataUrl;
  link.rel = 'noopener';
  link.click();
};

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.download = fileName;
  link.href = url;
  link.rel = 'noopener';
  link.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  });
};

const createGifBlob = (frames: ImageData[], repeat: GifExportInput['repeat']) => {
  const gif = GIFEncoder();
  const loop = getGifRepeat(repeat);

  frames.forEach((frame) => {
    const gifFrame = createGifFrame(frame);

    gif.writeFrame(gifFrame.index, frame.width, frame.height, {
      delay: GIF_FRAME_DELAY_MS,
      palette: gifFrame.palette,
      repeat: loop,
    });
  });

  gif.finish();

  const bytes = gif.bytes();
  const buffer = new ArrayBuffer(bytes.byteLength);

  new Uint8Array(buffer).set(bytes);

  return new Blob([buffer], { type: GIF_TYPE });
};

const createGifFrame = (imageData: ImageData) => {
  const palette = quantize(imageData.data, GIF_MAX_COLORS);
  const index = applyPalette(imageData.data, palette);

  return { index, palette };
};

const getGifRepeat = (repeat: GifExportInput['repeat']) => {
  if (repeat === 'once') {
    return GIF_REPEAT_ONCE;
  }

  return GIF_REPEAT_FOREVER;
};

const captureGifFrames = (element: HTMLElement) => {
  const frameIndexes = Array.from({ length: GIF_FRAME_COUNT });

  return frameIndexes.reduce<Promise<ImageData[]>>(
    async (previousFrames) => {
      const frames = await previousFrames;

      await waitForFrame();

      const frame = await captureGifFrame(element);

      return frames.concat(frame);
    },
    Promise.resolve([] as ImageData[]),
  );
};

const waitForFrame = () => {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, GIF_FRAME_DELAY_MS);
  });
};

const captureGifFrame = async (element: HTMLElement) => {
  const canvas = await toCanvas(element, exportOptions);

  return getCanvasImageData(canvas);
};

const getCanvasImageData = (canvas: HTMLCanvasElement) => {
  const context = canvas.getContext('2d', { willReadFrequently: true });

  if (!context) {
    throw new Error('Unable to read graph export canvas.');
  }

  return context.getImageData(0, 0, canvas.width, canvas.height);
};

const toPngDataUrl = (element: HTMLElement) => {
  return toPng(element, exportOptions);
};

const toSvgDataUrl = (element: HTMLElement) => {
  return toSvg(element, exportOptions);
};

const createFileName = (name: string, extension: string) => {
  return `${getSafeFileStem(name)}.${extension}`;
};

const getSafeFileStem = (name: string) => {
  const stem = name
    .trim()
    .replace(invalidFileNamePattern, '-')
    .replace(duplicateDashPattern, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

  return stem || SVG_FILE_FALLBACK_NAME;
};
