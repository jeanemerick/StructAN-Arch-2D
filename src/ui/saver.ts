/**
 * Entrega de arquivos (modelo .json, imagem .png, tabela .csv) a quem está na página.
 *
 * - Página hospedada no claude.ai: o navegador bloqueia salvamentos iniciados pela própria
 *   página, então o arquivo é oferecido pela capacidade `downloads` da plataforma.
 * - Arquivo local ou GitHub Pages: salvamento comum do navegador (link temporário).
 */

export interface DownloadsApi {
  save(req: { filename: string; data: string | Blob }): Promise<{ status: 'saved' | 'delivered' }>;
}

export interface SaveEnv {
  /** A página roda dentro da plataforma (existe window.claude). */
  hosted: boolean;
  downloads: DownloadsApi | null;
}

export type SaveRoute = 'capability' | 'anchor' | 'unavailable';

export function chooseSaveRoute(env: SaveEnv): SaveRoute {
  if (!env.hosted) return 'anchor';
  return env.downloads ? 'capability' : 'unavailable';
}

const UNAVAILABLE = 'Nesta visualização não é possível salvar arquivos. Abra a página no navegador, pelo link dela, e tente outra vez.';

/** Mensagem para quem está na página, ou null quando não há o que dizer (ex.: a pessoa recusou). */
export function saveErrorMessage(code: string): string | null {
  switch (code) {
    case 'declined':
      return null;
    case 'rate_limited':
      return 'Há outro pedido de salvamento em aberto. Conclua-o e tente de novo.';
    case 'rejected_extension':
    case 'extension_not_enabled':
      return 'Este formato de arquivo não pode ser salvo nesta visualização.';
    case 'too_large':
      return 'O arquivo ficou grande demais para ser salvo nesta visualização.';
    default:
      return UNAVAILABLE;
  }
}

/** Salva pelo caminho adequado. Devolve uma mensagem de aviso ou null se não houver nada a mostrar. */
export async function saveWith(
  env: SaveEnv,
  filename: string,
  data: Blob,
  anchorSave: (filename: string, data: Blob) => void,
): Promise<string | null> {
  const route = chooseSaveRoute(env);
  if (route === 'anchor') {
    anchorSave(filename, data);
    return null;
  }
  if (route === 'unavailable' || !env.downloads) return UNAVAILABLE;
  try {
    await env.downloads.save({ filename, data });
    return null;
  } catch (e) {
    const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : 'unavailable';
    return saveErrorMessage(code);
  }
}

// ------------------------------------------------------------------ navegador

interface ClaudeHost {
  use(name: 'downloads'): Promise<DownloadsApi | null>;
}

function host(): ClaudeHost | null {
  const c = (globalThis as { claude?: Partial<ClaudeHost> }).claude;
  return c && typeof c.use === 'function' ? (c as ClaudeHost) : null;
}

let downloadsPromise: Promise<DownloadsApi | null> | null = null;

/** Pede a capacidade já na abertura da página, para o primeiro clique não esperar por ela. */
export function warmUpSaver(): void {
  const h = host();
  if (h && !downloadsPromise) downloadsPromise = h.use('downloads').catch(() => null);
}

function anchorSave(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Salva o arquivo; devolve uma mensagem de aviso ou null. */
export async function saveFile(filename: string, data: Blob): Promise<string | null> {
  const h = host();
  if (!h) return saveWith({ hosted: false, downloads: null }, filename, data, anchorSave);
  warmUpSaver();
  const downloads = await downloadsPromise!;
  return saveWith({ hosted: true, downloads }, filename, data, anchorSave);
}
