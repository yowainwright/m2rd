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

const getSafeFileStem = (name: string) => {
  const stem = name
    .trim()
    .replace(invalidFileNamePattern, '-')
    .replace(duplicateDashPattern, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

  return stem || SVG_FILE_FALLBACK_NAME;
};

const createFileName = (name: string, extension: string) => {
  return `${getSafeFileStem(name)}.${extension}`;
};

const shouldExportNode = (node: Node) => {
  if (!(node instanceof Element)) {
    return true;
  }

  return node.closest('[data-m2rd-export-ignore="true"]') === null;
};

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

const exportOptions = {
  cacheBust: true,
  filter: shouldExportNode,
};

const toSvgDataUrl = (element: HTMLElement) => {
  return toSvg(element, exportOptions);
};

const toPngDataUrl = (element: HTMLElement) => {
  return toPng(element, exportOptions);
};

const waitForFrame = () => {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, GIF_FRAME_DELAY_MS);
  });
};

const getCanvasImageData = (canvas: HTMLCanvasElement) => {
  const context = canvas.getContext('2d', { willReadFrequently: true });

  if (!context) {
    throw new Error('Unable to read graph export canvas.');
  }

  return context.getImageData(0, 0, canvas.width, canvas.height);
};

const captureGifFrame = async (element: HTMLElement) => {
  const canvas = await toCanvas(element, exportOptions);

  return getCanvasImageData(canvas);
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

const getGifRepeat = (repeat: GifExportInput['repeat']) => {
  if (repeat === 'once') {
    return GIF_REPEAT_ONCE;
  }

  return GIF_REPEAT_FOREVER;
};

const createGifFrame = (imageData: ImageData) => {
  const palette = quantize(imageData.data, GIF_MAX_COLORS);
  const index = applyPalette(imageData.data, palette);

  return { index, palette };
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
