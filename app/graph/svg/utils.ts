export const getText = (element: Element, selector: string) => {
  return element.querySelector(selector)?.textContent?.trim() || '';
};

export const readSvg = (svg: string, dom = document) => {
  const container = dom.createElement('div');

  container.innerHTML = svg;

  return container.querySelector('svg');
};
