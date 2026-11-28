type Files = Record<string, { content: string }>;
type Gist = {
  id: string;
  public: boolean;
  description: string;
  owner: { id: number };
  files: Files;
  history: { version: string }[];
  fork_of?: { id: string };
};

export const githubGistsFixture = (fallback: typeof fetch): typeof fetch => {
  const gists = new Map<string, Gist>();
  const revisions = new Map<string, Gist>();
  return async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.origin !== 'https://api.github.com') {
      const response = await fallback(input, init);
      return response;
    }
    const match = /^\/gists(?:\/([\da-f]+))?(?:\/([\da-f]+|forks|commits))?$/.exec(url.pathname);
    if (!match) return fallback(input, init);
    const [, id, action] = match;
    const owner = getOwner(request);
    if (!id) return handleCollection(request, owner, gists, revisions);
    const gist = gists.get(id);
    if (!gist) return Response.json({}, { status: 404 });
    if (action === 'commits') return Response.json(gist.history);
    if (action === 'forks') return forkFixture(gist, owner, gists, revisions);
    if (action) return Response.json(revisions.get(`${id}/${action}`) ?? {});
    if (request.method === 'PATCH') return updateFixture(request, gist, owner, revisions);
    return Response.json(gist);
  };
};

const getOwner = (request: Request) => {
  const authorization = request.headers.get('authorization');
  const token = /fixture-github-token-(\d+)$/.exec(authorization ?? '');
  return Number(token?.[1] ?? 81);
};

const handleCollection = async (
  request: Request,
  owner: number,
  gists: Map<string, Gist>,
  revisions: Map<string, Gist>,
) => {
  if (request.method === 'GET') {
    const owned = Array.from(gists.values()).filter((gist) => gist.owner.id === owner);
    return Response.json(owned);
  }
  const body = await request.json();
  if (body.public !== false) return Response.json({}, { status: 422 });
  const id = (gists.size + 10).toString(16);
  const { files, description } = body;
  const gist = { id, public: false, description, owner: { id: owner }, files, history: [] };
  gists.set(id, gist);
  return Response.json(saveRevision(gist, revisions), { status: 201 });
};

const forkFixture = (
  original: Gist,
  owner: number,
  gists: Map<string, Gist>,
  revisions: Map<string, Gist>,
) => {
  const id = (gists.size + 10).toString(16);
  const gist = { ...original, id, owner: { id: owner }, fork_of: { id: original.id }, history: [] };
  gists.set(id, gist);
  return Response.json(saveRevision(gist, revisions), { status: 201 });
};

const updateFixture = async (
  request: Request,
  gist: Gist,
  owner: number,
  revisions: Map<string, Gist>,
) => {
  if (gist.owner.id !== owner) return Response.json({}, { status: 403 });
  const { files } = await request.json();
  gist.files = { ...gist.files, ...files };
  return Response.json(saveRevision(gist, revisions));
};

const saveRevision = (gist: Gist, revisions: Map<string, Gist>) => {
  const version = (revisions.size + 1).toString(16).padStart(40, '0');
  gist.history = [{ version }, ...gist.history];
  revisions.set(`${gist.id}/${version}`, structuredClone(gist));
  return gist;
};
