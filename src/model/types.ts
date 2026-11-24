/**
 * Modelo estrutural 2D. Unidades internas: kN, m, rad (E em kN/m²).
 * Eixos globais: X para a direita, Y para cima, rotação anti-horária positiva.
 */

export type Id = string;

export interface Support {
  /** Restrições de deslocamento em X, Y e rotação. */
  rx: boolean;
  ry: boolean;
  rz: boolean;
  /** Molas (kN/m, kN/m, kN·m/rad) nas direções não restringidas. */
  kx?: number;
  ky?: number;
  kz?: number;
  /** Recalques impostos (m, m, rad) nas direções restringidas. */
  dx?: number;
  dy?: number;
  dz?: number;
}

export interface NodalLoad {
  fx: number;
  fy: number;
  mz: number;
}

export interface Node {
  id: Id;
  x: number;
  y: number;
  support?: Support;
  load?: NodalLoad;
}

/**
 * Forma da seção. Em 'generic' e 'direct', h (m) é a altura da seção, pedida só quando há
 * gradiente de temperatura. 'direct': rigidezes informadas diretamente (EA em kN, EI em kN·m²);
 * o E da seção não entra no cálculo.
 */
export type Shape =
  | { kind: 'rect'; b: number; h: number }
  | { kind: 'circ'; d: number }
  | { kind: 'generic'; A: number; I: number; h?: number }
  | { kind: 'direct'; EA: number; EI: number; h?: number };

export interface Section {
  id: Id;
  name: string;
  /** Módulo de elasticidade em kN/m². */
  E: number;
  /** Dimensões em m (A em m², I em m⁴ na seção genérica). */
  shape: Shape;
  /** Coeficiente de dilatação térmica (1/°C). */
  alpha: number;
}

/**
 * Carga distribuída linear entre as extremidades do elemento (kN/m).
 * - globalX / globalY: direção global; `ref` diz se a intensidade é por metro de
 *   comprimento do elemento ('length') ou por metro de projeção ('projection').
 * - localX / localY: direção local (localY negativo em arco = pressão para dentro
 *   quando o eixo local y aponta para fora da curvatura); `ref` é ignorado.
 * Em arcos, qi e qj valem nas extremidades e a variação é linear em x.
 */
export interface DistLoad {
  dir: 'globalX' | 'globalY' | 'localX' | 'localY';
  ref: 'length' | 'projection';
  qi: number;
  qj: number;
}

/**
 * Comportamento da barra:
 * - frame: pórtico (EA e EI);
 * - axial: somente axial (tirante ou escora): só EA, sempre birrotulada;
 * - bending: somente flexão: só EI, barra inextensível (deformação axial desprezada).
 */
export type Behavior = 'frame' | 'axial' | 'bending';

/**
 * Variação de temperatura (°C) em relação à de referência, na face externa (lado +y local:
 * face superior da barra desenhada da esquerda para a direita, extradorso do arco) e na
 * face interna (lado −y). Parte uniforme = média; gradiente = (tInt − tExt)/h.
 */
export interface Thermal {
  tExt: number;
  tInt: number;
}

export interface MemberBase {
  id: Id;
  ni: Id;
  nj: Id;
  sectionId: Id;
  hingeI: boolean;
  hingeJ: boolean;
  loads: DistLoad[];
  behavior: Behavior;
  thermal?: Thermal;
}

export interface Bar extends MemberBase {
  kind: 'bar';
}

export type ArcShape = 'parabola' | 'circular' | 'catenary';

/**
 * Parâmetros geradores do arco criado entre dois nós: forma, altura (m, medida da corda no meio
 * do vão) e os nós das nascenças a e b. Quando a ou b mudam de posição, a equação é refeita.
 * Os trechos de um arco dividido guardam os mesmos parâmetros (as mesmas nascenças).
 */
export interface ArcGen {
  shape: ArcShape;
  rise: number;
  a: Id;
  b: Id;
}

/** Arco definido por y = f(x) entre as abscissas dos nós ni (esquerda) e nj (direita). */
export interface Arc extends MemberBase {
  kind: 'arc';
  expr: string;
  nSeg: number;
  gen?: ArcGen;
}

export type Member = Bar | Arc;

export interface Model {
  version: 2;
  nodes: Node[];
  members: Member[];
  sections: Section[];
}

export interface Issue {
  severity: 'error' | 'warning';
  message: string;
  target?: { kind: 'node' | 'member'; id: Id };
}
