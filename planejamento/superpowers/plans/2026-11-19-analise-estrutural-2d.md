# Arcada (nome provisório) — análise estrutural 2D de barras e arcos · Plano de implementação

> **Para agentes executores:** sub-skill obrigatória `superpowers:executing-plans` (execução nesta sessão, tarefa a tarefa, com uma revisão independente ao final). Cada tarefa tem caixa de marcação para acompanhamento.

**Objetivo:** aplicação 2D que calcula reações, esforço normal, esforço cortante, momento fletor e configuração deformada de estruturas reticuladas, incluindo arcos definidos por uma equação y = f(x).

**Arquitetura:** núcleo de cálculo puro em TypeScript (equação → modelo → malha → solver → diagramas), sem dependência de interface e validado contra soluções analíticas; interface React + SVG por cima; o build gera um único HTML autocontido.

**Tecnologias:** TypeScript, React, Vite, Vitest, `vite-plugin-singlefile`. Node 22.

**Especificação:** seções "Contexto" a "Projeto" deste mesmo documento.

---

## Contexto

Jean e um amigo trabalham com o Ftool, que não modela arcos. Querem uma ferramenta no mesmo espírito (análise 2D de vigas, pórticos e treliças), com interface mais enxuta e com arcos descritos por uma equação entre x e y. O repositório indicado, `jeanemerick/Jean-Rafa-Test`, contém apenas um `README.md` com o título — projeto do zero.

## Decisões que tomei (três perguntas ficaram sem resposta; tudo ajustável na aprovação)

| Tema | Decisão | Motivo |
|---|---|---|
| Plataforma | Aplicação web em arquivo HTML único | Abre com duplo clique, sem instalação e sem internet; simples de compartilhar; consigo testar a tela aqui |
| Montagem do modelo | Desenho com grade/snap + painel lateral para valores exatos | Próximo do Ftool, mas com menos caixas de diálogo |
| Extras da v1 | Molas, recalques e exportação (PNG/CSV) | Custo pequeno. Temperatura e linhas de influência ficam para a etapa seguinte |
| Código | Repositório `jeanemerick/Jean-Rafa-Test`, ramo `claude/analise-estrutural-2d` | Pedido de vocês |

**Caminhos descartados:** desktop em Python (PySide6) exige instalação em cada máquina e é difícil de demonstrar nesta sessão; solver em Python com tela web soma um servidor local e duas linguagens para manter.

## Projeto

### Tela

```
┌──────────────────────────────────────────────────────────────────────┐
│ Novo  Abrir  Salvar  Exemplos ▾  Exportar ▾        Desfazer  Refazer │
├──────┬────────────────────────────────────────────────┬──────────────┤
│ Sel. │                                                │ Propriedades │
│ Nó   │        Área de desenho (grade + snap,          │ do item      │
│ Barra│         zoom na roda, arrastar p/ mover)       │ selecionado: │
│ Arco │                                                │ coordenadas, │
│      │              ⌒⌒⌒⌒⌒⌒⌒⌒                          │ apoio, cargas│
│      │            ▲          ▲                        │ seção, rótula│
├──────┴────────────────────────────────────────────────┴──────────────┤
│ [Modelo] [Reações] [N] [Q] [M] [Deformada]   escala ──●──  valores ☑ │
│ x: 3,50 m  y: 2,00 m          Análise concluída / mensagem de erro   │
└──────────────────────────────────────────────────────────────────────┘
```

Quatro ferramentas apenas. Apoios, cargas, seção e rótulas são editados no painel do item selecionado. A análise roda sozinha a cada alteração; as abas inferiores trocam o que é desenhado.

### Escopo da v1

- Nós, barras retas, arcos por equação; inserção de nó sobre barra ou arco (divide o elemento).
- Apoios: restrição em X, Y e rotação (atalhos: engaste, 2º gênero, 1º gênero), molas e recalques.
- Rótulas nas extremidades de barras e arcos (arco triarticulado = dois arcos com rótula no fecho).
- Cargas: nodais (Fx, Fy, Mz); distribuídas uniformes ou lineares em direção global ou local.
- Resultados: reações, N, Q, M, deformada com escala ajustável, consulta de valor por ponto, tabela.
- Arquivo: salvar/abrir modelo (JSON), gravação automática no navegador, exemplos prontos, exportar PNG e CSV.

**Fora da v1:** temperatura, linhas de influência, apoios inclinados, casos/combinações de carga, deformação por cortante (Timoshenko), não linearidade, seleção múltipla, peso próprio automático.

### Arcos

- Definição: equação `y = f(x)` em coordenadas globais + x inicial + x final (x inicial < x final) + número de segmentos (padrão 40, de 4 a 200).
- Modelos prontos preenchem a equação a partir de vão e flecha: parábola, arco circular, catenária.
- Cálculo: a curva é dividida em segmentos retos de **mesmo comprimento de arco** (funciona com tangente vertical, como no semicírculo); cada segmento é um elemento de pórtico.
- N e Q do arco: a resultante em cada seção é projetada na **tangente real da curva**, evitando o serrilhado da poligonal.
- Cargas distribuídas no arco: por metro de projeção horizontal (sobrecarga), por metro de comprimento de arco (peso próprio) ou normal ao eixo (pressão). Variação linear em x entre as extremidades.
- Os nós das extremidades pertencem ao modelo (recebem apoios, cargas, outras barras, tirantes).

### Convenções

- Eixos globais: X para a direita, Y para cima, rotação anti-horária positiva. Carga gravitacional = valor negativo em Y.
- Eixo local: x do nó inicial ao final; y a 90° anti-horário. Arcos sempre da esquerda para a direita.
- N positivo = tração. Q positivo = gira o trecho no sentido horário. M positivo = tração na fibra do lado −y local; **diagrama de M desenhado do lado tracionado**, como no Ftool.
- Unidades de entrada: m, kN, kN/m, kN·m; E em GPa; seção em cm (retangular b×h, circular d, ou genérica A em cm² e I em cm⁴); molas em kN/m e kN·m/rad; recalques em mm e rad. Saída: kN, kN·m, deslocamentos em mm.

---

## Restrições globais

- Análise linear elástica, Euler–Bernoulli, 3 graus de liberdade por nó (ux, uy, rz).
- Unidades internas: kN, m, rad. Conversões só na camada de interface (`src/ui/format.ts`).
- `src/expr`, `src/model` e `src/solver` não importam nada de `src/ui` nem do DOM; rodam em Node.
- Equação avaliada por interpretador próprio; proibido `eval` e `new Function`.
- Interface e mensagens em pt-BR. Entrada numérica aceita vírgula ou ponto decimal; exibição com vírgula.
- Entregável `docs/index.html` autocontido, sem rede, abrindo por `file://`.
- Dependências: `react`, `react-dom`; desenvolvimento: `vite`, `@vitejs/plugin-react`, `typescript`, `vitest`, `vite-plugin-singlefile`. Nenhuma outra.
- Tolerâncias de teste: 1e-9 relativa para barras (solução exata); as indicadas em cada teste para arcos (nSeg = 40).
- Ciclo de cada tarefa: escrever os testes listados e vê-los falhar → implementar → `npm test` verde → commit com a mensagem indicada.

## Foco de revisão

Situações prováveis no dia a dia que precisam de comportamento correto; cada uma tem teste na tarefa indicada.

1. **Estrutura hipostática** (apoios insuficientes ou mecanismo criado por rótulas) → mensagem com nó e direção livres, nunca `NaN` na tela. (T6)
2. **Equação inválida ou fora do domínio** (`sqrt(25-x^2)` de −6 a 6, `1/x` cruzando 0, parêntese aberto, `2x`) → mensagem apontando o problema, sem travar. (T1, T2)
3. **Nó em que todas as barras são rotuladas** (treliça) → rotação do nó travada automaticamente, sem singularidade. (T6)
4. **Arco com tangente vertical nas extremidades** (semicírculo) → malha regular e resultado dentro da tolerância. (T5, T7)
5. **Nó de extremidade fora da curva do arco** após edição manual, barra de comprimento nulo, x inicial ≥ x final → erro de validação com o item destacado. (T2)

## Estrutura de arquivos

```
package.json  tsconfig.json  vite.config.ts  index.html  .gitignore  README.md
src/expr/parser.ts        interpretador da equação y = f(x)
src/model/types.ts        tipos do modelo
src/model/ops.ts          operações puras (criar, dividir, apagar, editar)
src/model/validate.ts     validação com mensagens em pt-BR
src/model/io.ts           gravar/ler JSON
src/model/presets.ts      equações prontas (parábola, circular, catenária)
src/model/examples.ts     modelos de exemplo
src/solver/element.ts     rigidez local, cargas equivalentes, condensação de rótulas
src/solver/skyline.ts     reordenação RCM + fatoração LDLᵀ em perfil
src/solver/mesh.ts        modelo → malha de elementos retos
src/solver/analyze.ts     montagem, solução, reações, esforços de extremidade
src/solver/diagrams.ts    N, Q, M e deslocamentos ao longo de cada elemento
src/ui/state.ts           reducer + desfazer/refazer
src/ui/format.ts          números pt-BR e conversão de unidades
src/ui/App.tsx  Toolbar.tsx  Canvas.tsx  ResultsLayer.tsx  StatusBar.tsx  styles.css
src/ui/panels/NodePanel.tsx  MemberPanel.tsx  ArcForm.tsx  SectionsPanel.tsx  ResultsTable.tsx
src/ui/export.ts          PNG e CSV
tests/*.test.ts           um arquivo por módulo do núcleo + casos analíticos
scripts/smoke.mjs         teste de ponta a ponta com o Chromium já instalado
docs/index.html           build único (entregável)
```

---

## Tarefas

### Task 1 — Estrutura do projeto e interpretador de equações

**Arquivos:** criar `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore`, `src/expr/parser.ts`, `tests/expr.test.ts`.

**Produz:**
```ts
type Compiled = { ok: true; fn: (x: number) => number } | { ok: false; error: string; pos: number };
function compileExpr(src: string): Compiled;
```
Gramática: números com `.` ou `,` decimal e notação `1e3`; variável `x`; constantes `pi`, `e`; `+ - * / ^` (`^` associativo à direita, menos unário com precedência inferior a `^`); parênteses; funções de um argumento `sin cos tan asin acos atan sinh cosh tanh sqrt abs exp ln log` (`log` = base 10). Scripts npm: `dev`, `test` (`vitest run`), `build` (saída em `docs/`).

**Testes (`tests/expr.test.ts`):**
- `"x*(20-x)/20"` em x=10 → 5
- `"4*2,5*x*(10-x)/10^2"` em x=5 → 2,5
- `"-x^2"` em x=3 → −9; `"2^3^2"` → 512
- `"sqrt(25-x^2)"` em x=3 → 4; `"-10*cosh(x/10)"` em x=0 → −10; `"sin(pi/2)"` → 1
- `""`, `"2*(x+1"`, `"foo(x)"`, `"2x"`, `"x+"` → `ok: false` com `error` não vazio e `pos` dentro da string; a mensagem de `"2x"` contém `*`

- [ ] Ciclo concluído · commit `feat: estrutura do projeto e interpretador de equações`

### Task 2 — Modelo de dados, operações e validação

**Arquivos:** criar `src/model/types.ts`, `src/model/ops.ts`, `src/model/validate.ts`, `tests/ops.test.ts`, `tests/validate.test.ts`.

**Consome:** `compileExpr` (T1).

**Produz:**
```ts
type Id = string;
interface Support { rx: boolean; ry: boolean; rz: boolean;      // restrições
  kx?: number; ky?: number; kz?: number;                         // molas (kN/m, kN·m/rad)
  dx?: number; dy?: number; dz?: number }                        // recalques (m, rad)
interface NodalLoad { fx: number; fy: number; mz: number }
interface Node { id: Id; x: number; y: number; support?: Support; load?: NodalLoad }
type Shape = { kind: 'rect'; b: number; h: number } | { kind: 'circ'; d: number } | { kind: 'generic'; A: number; I: number };
interface Section { id: Id; name: string; E: number; shape: Shape }   // E em kN/m², dimensões em m
interface DistLoad { dir: 'globalX' | 'globalY' | 'localX' | 'localY'; ref: 'length' | 'projection'; qi: number; qj: number }
interface MemberBase { id: Id; ni: Id; nj: Id; sectionId: Id; hingeI: boolean; hingeJ: boolean; loads: DistLoad[] }
interface Bar extends MemberBase { kind: 'bar' }
interface Arc extends MemberBase { kind: 'arc'; expr: string; nSeg: number }
type Member = Bar | Arc;
interface Model { version: 1; nodes: Node[]; members: Member[]; sections: Section[] }
interface Issue { severity: 'error' | 'warning'; message: string; target?: { kind: 'node' | 'member'; id: Id } }

function emptyModel(): Model;                         // já contém uma seção padrão (25 GPa, 20×40 cm)
function sectionProps(s: Section): { EA: number; EI: number };
function addNode(m: Model, x: number, y: number): { model: Model; id: Id };          // funde com nó a menos de 1e-6 m
function addBar(m: Model, ni: Id, nj: Id): { model: Model; id: Id };
function addArc(m: Model, a: { expr: string; xi: number; xj: number; nSeg: number; sectionId: Id }): { model: Model; id: Id } | { error: string };
function updateArc(m: Model, id: Id, patch: Partial<Pick<Arc, 'expr' | 'nSeg'>> & { xi?: number; xj?: number }): Model | { error: string };
function splitMember(m: Model, id: Id, at: number): { model: Model; nodeId: Id };    // barra: fração 0–1; arco: coordenada x
function updateNode / updateMember / setSupport / setNodalLoad / deleteNode / deleteMember  // (m, id, valor) → Model
function validateModel(m: Model): Issue[];
```
Todas as operações devolvem um modelo novo (imutável). `addArc` e `updateArc` reposicionam os nós das extremidades em `(x, f(x))`. `splitMember` reparte as cargas distribuídas com intensidade interpolada no ponto de corte e mantém as rótulas apenas nas extremidades originais. `deleteNode` remove as barras ligadas a ele.

**Testes:**
- `addNode` duas vezes no mesmo ponto → mesmo `id`, um nó só.
- `addArc` com `"x*(20-x)/20"`, 0 a 20 → nós em (0,0) e (20,0); com xi=20, xj=0 → `error`.
- `splitMember` no arco anterior em x=10 → nó em (10,5), dois arcos com a mesma `expr`; carga `qi=-10,qj=-20` vira `(-10,-15)` e `(-15,-20)`.
- `splitMember` em barra na fração 0,25 → nó a um quarto do comprimento.
- `validateModel`: barra de comprimento nulo; arco `"sqrt(25-x^2)"` de −6 a 6; arco `"1/x"` de −1 a 1; nó de extremidade deslocado 0,1 m da curva; modelo sem apoio; seção com E=0 → cada um gera `severity: 'error'` com `target` correto. Nó isolado → `warning`.

- [ ] Ciclo concluído · commit `feat: modelo de dados, operações e validação`

### Task 3 — Elemento de pórtico plano

**Arquivos:** criar `src/solver/element.ts`, `tests/element.test.ts`.

**Produz:**
```ts
interface ElemLoad { px1: number; px2: number; wy1: number; wy2: number }   // eixos locais, por metro de elemento
function localStiffness(EA: number, EI: number, L: number): number[][];     // 6×6, GDL [u1,v1,θ1,u2,v2,θ2]
function equivLoads(L: number, q: ElemLoad): number[];                      // 6
function condense(k: number[][], feq: number[], released: number[]): { k: number[][]; feq: number[]; recover(u: number[]): number[] };
function toGlobal(k: number[][], c: number, s: number): number[][];
function vecToGlobal(v: number[], c: number, s: number): number[];
function vecToLocal(v: number[], c: number, s: number): number[];
```
Cargas equivalentes para carga linear: `F1y = L(7w1+3w2)/20`, `M1 = L²(3w1+2w2)/60`, `F2y = L(3w1+7w2)/20`, `M2 = −L²(2w1+3w2)/60`, `F1x = L(2p1+p2)/6`, `F2x = L(p1+2p2)/6`. `condense` zera linhas/colunas dos GDL liberados (índices 2 e/ou 5) por condensação estática; `recover` devolve o vetor local completo com as rotações liberadas calculadas.

**Testes:** termos `EA/L`, `12EI/L³`, `6EI/L²`, `4EI/L`, `2EI/L` nas posições certas e simetria; carga uniforme → `wL/2` e `±wL²/12`; triangular (0→w) → `3wL/20`, `7wL/20`; `condense([5])` → `k[2][2] = 3EI/L`; `condense([2,5])` → só termos axiais e momentos equivalentes nulos; `toGlobal` a 90° troca os papéis de u e v.

- [ ] Ciclo concluído · commit `feat: elemento de pórtico plano com rótulas`

### Task 4 — Solver em perfil com reordenação

**Arquivos:** criar `src/solver/skyline.ts`, `tests/skyline.test.ts`.

**Produz:**
```ts
function rcmOrder(nNodes: number, edges: [number, number][]): number[];    // perm[novo] = antigo
class Skyline {
  constructor(n: number, firstRow: Int32Array);       // primeira linha não nula de cada coluna
  add(i: number, j: number, v: number): void;         // simétrico; grava no triângulo superior
  diag(i: number): number;
  factor(): { ok: true } | { ok: false; index: number };   // LDLᵀ; falha se pivô ≤ 1e-10 × maior diagonal
  solve(b: Float64Array): Float64Array;
}
```

**Testes:** matriz simétrica definida positiva em banda 60×60 gerada com semente fixa → solução igual à da eliminação de Gauss densa (1e-9); matriz singular → `ok: false` com `index` do pivô nulo; cadeia de 30 nós com numeração embaralhada → semilargura de banda 1 após `rcmOrder`.

- [ ] Ciclo concluído · commit `feat: solver em perfil com reordenação RCM`

### Task 5 — Geração da malha

**Arquivos:** criar `src/solver/mesh.ts`, `tests/mesh.test.ts`.

**Consome:** tipos (T2), `compileExpr` (T1), `ElemLoad` (T3).

**Produz:**
```ts
interface MeshNode { x: number; y: number; modelNodeId?: Id }
interface MeshElem { a: number; b: number; L: number; c: number; s: number; EA: number; EI: number;
  relA: boolean; relB: boolean; load: ElemLoad; memberId: Id }
interface Mesh { nodes: MeshNode[]; elems: MeshElem[]; memberElems: Map<Id, number[]> }
function arcPoints(fn: (x: number) => number, xi: number, xj: number, nSeg: number): { x: number; y: number }[];
function buildMesh(model: Model): Mesh;
```
`arcPoints`: amostra a curva em 4096 intervalos de x, acumula o comprimento da poligonal, inverte para `nSeg` divisões de comprimento igual e reavalia `y = f(x)`; primeiro e último pontos exatos. Conversão de carga por elemento: `ref: 'projection'` multiplica a intensidade por `|c|` (globalY) ou `|s|` (globalX); vetor global `(qx, qy)` → local `px = qx·c + qy·s`, `wy = −qx·s + qy·c`. Em arcos, a intensidade em cada nó da malha é interpolada linearmente em x; `hingeI` vira `relA` do primeiro segmento, `hingeJ` vira `relB` do último.

**Testes:** semicírculo `"sqrt(25-x^2)"`, −5 a 5, nSeg=10 → 11 pontos sobre a curva, cordas iguais (±1%), soma das cordas = 15,64 (±0,5%); barra a 30° com `globalY, projection, q=−10` → `wy = −10·cos²30°`, `px = −10·cos30°·sin30°`; arco com 40 segmentos → 41 nós, só os dois extremos com `modelNodeId`; barra → um elemento; dois elementos que partilham nó do modelo partilham o mesmo nó de malha.

- [ ] Ciclo concluído · commit `feat: malha de barras e arcos`

### Task 6 — Análise: montagem, solução e reações

**Arquivos:** criar `src/solver/analyze.ts`, `tests/helpers.ts`, `tests/beams.test.ts`, `tests/frames.test.ts`.

**Consome:** T2–T5.

**Produz:**
```ts
interface Reaction { nodeId: Id; fx: number; fy: number; mz: number }
interface AnalysisOk { ok: true; mesh: Mesh; u: Float64Array;       // 3 por nó de malha, global
  endForces: number[][];                                            // por elemento, local, 6 valores
  endDisp: number[][];                                              // por elemento, local, com rotações liberadas recuperadas
  reactions: Reaction[] }
type Analysis = AnalysisOk | { ok: false; issues: Issue[] };
function analyze(model: Model): Analysis;
```
Sequência: `validateModel` (erros interrompem) → `buildMesh` → numeração dos GDL livres na ordem de `rcmOrder` → montagem em `Skyline` com condensação das rótulas → molas somadas à diagonal → recalques levados ao vetor de cargas elemento a elemento → GDL de rotação livres com rigidez nula são travados → `factor` (falha vira `Issue` "Estrutura instável: deslocamento livre no nó N, direção D") → esforços de extremidade `k·u − feq` → reações pelo equilíbrio nodal (inclui força das molas).

`tests/helpers.ts`: `expectEquilibrium(model, res)` verifica ΣFx, ΣFy e ΣM = 0 (1e-8) e é chamado em todos os testes de análise. Seção de referência: 25 GPa, retangular 20×50 cm (EI = 52 083,33 kN·m²).

**Testes:**
- Biapoiada L=6, q=10: reações 30 e 30.
- Engastada L=3, P=20 na ponta: reação 20, momento de engaste 60, flecha na ponta 3,456 mm.
- Biengastada L=6, q=10: momentos de engaste 30, reações 30.
- Triangular biapoiada L=6, 0→12: reações 12 e 24.
- Gerber: engaste em x=0, rótula em x=4, apoio móvel em x=8, q=10 → reação do apoio móvel 20, reação vertical do engaste 60, momento de engaste 160.
- Treliça A(0,0) fixo, B(4,0) móvel, C(2,3), barras birrotuladas, P=30 em C → reações 15 e 15; N(AC) = −18,028; N(AB) = +10.
- Pórtico (pilares 4 m engastados, viga 6 m), 10 kN horizontal em cada nó superior → cortante 10 kN em cada base.
- Recalque: biengastada L=4, apoio final desce 10 mm → V = 97,656 kN, M = 195,31 kN·m.
- Mola: engastada L=3 com mola vertical na ponta k = 5787,04 kN/m e P=20 → flecha 1,728 mm, força na mola 10 kN.
- Instável: viga só com um apoio móvel → `ok: false`, mensagem contém "instável". Viga com três rótulas alinhadas → idem.

- [ ] Ciclo concluído · commit `feat: análise pelo método da rigidez direta`

### Task 7 — Diagramas N, Q, M e deformada

**Arquivos:** criar `src/solver/diagrams.ts`, `tests/diagrams.test.ts`, `tests/arcs.test.ts`.

**Consome:** `AnalysisOk` (T6).

**Produz:**
```ts
interface Station { s: number; x: number; y: number; tx: number; ty: number;   // posição e tangente unitária
  N: number; Q: number; M: number; dx: number; dy: number }                    // esforços e deslocamento global
function memberStations(model: Model, res: AnalysisOk, memberId: Id, nPerBar?: number): Station[];   // padrão 20
function extremes(st: Station[]): { N: [number, number]; Q: [number, number]; M: [number, number]; disp: number };
```
Barras, a partir dos esforços no início `(f1x, f1y, m1)` e da carga local: `N(s) = −f1x − ∫p`, `Q(s) = f1y + ∫w`, `M(s) = −m1 + f1y·s + ∫w(ξ)(s−ξ)dξ` (polinômios exatos). Deslocamentos locais por integração: `u(s) = u1 + ∫N/EA`, `v(s) = v1 + θ1·s + ∬M/EI`, com `θ1` de `endDisp`. Arcos: uma estação por nó de malha; a resultante global da seção é projetada na tangente real `(1, f′)/√(1+f′²)` (derivada por diferença central; se não for finita, vale a direção do segmento vizinho).

**Testes de barras (1e-9):** biapoiada → M(L/2) = 45, flecha no meio 3,24 mm, Q nas pontas ±30; biengastada → M no meio +15; triangular → M máx 27,713 em s = 3,464 (±0,02 com 200 estações); engastada → M(0) = −60 e deslocamento na ponta 3,456 mm.

**Testes de arcos (nSeg = 40 por arco, `expectEquilibrium` em todos):**
- Parabólico triarticulado `"x*(20-x)/20"`, dividido em x=10 com rótula, q=10 por projeção → H = 100 e V = 100 (±0,1%); N no fecho −100 e na nascença −141,42 (±0,5%); |M| ≤ 1,0 kN·m em todas as estações.
- Parabólico biarticulado, mesma geometria, seção 30×60 cm → H = 100 (±0,5%).
- Semicircular biarticulado `"sqrt(25-x^2)"`, P=100 no fecho, seção genérica A=10 m², I=0,001 m⁴ → H = 31,83 (±1%).
- Semicircular triarticulado, mesma carga → H = V = 50 (±0,1%); M em x = −3,5355 igual a −103,55 (±1%).
- Circular R=10, 120° (`"sqrt(100-x^2)"`, x de −8,660254 a 8,660254), biarticulado, pressão normal `localY = −20` → N = −200 em todas as estações (±0,5%), |M| ≤ 1,0.
- Catenária `"-10*cosh(x/10)"`, −8 a 8, biarticulada, peso `globalY = −5` por comprimento → H = 50 (±1%), |M| ≤ 0,5.
- Convergência: parabólico biarticulado com carga só na metade esquerda, M máx com nSeg=20 e nSeg=80 diferem menos de 1%.

- [ ] Ciclo concluído · commit `feat: diagramas de esforços e deformada`

### Task 8 — Arquivo JSON, modelos prontos de equação e exemplos

**Arquivos:** criar `src/model/io.ts`, `src/model/presets.ts`, `src/model/examples.ts`, `tests/io.test.ts`.

**Produz:**
```ts
function serialize(m: Model): string;
function parseModel(text: string): { ok: true; model: Model } | { ok: false; error: string };
function parabola(x0: number, y0: number, L: number, f: number): string;
function circular(x0: number, y0: number, L: number, f: number): string;     // exige f ≤ L/2
function catenary(x0: number, y0: number, L: number, f: number): string;     // parâmetro a por bisseção
const examples: { slug: string; name: string; build(): Model }[];
```
Exemplos (slugs): `viga-biapoiada`, `portico-plano`, `arco-parabolico-biarticulado`, `arco-triarticulado`, `arco-atirantado` (tirante = barra birrotulada entre as nascenças, um apoio fixo e um móvel).

**Testes:** ida e volta `parseModel(serialize(m))` igual ao original; texto que não é JSON, `version` diferente de 1 e nó referenciado inexistente → `ok: false`; cada equação pronta com (x0=2, y0=1, L=10, f=3) vale 1 em x=2 e x=12 e vale 4 em x=7 (1e-9); `circular` com f > L/2 lança erro com mensagem; todo exemplo passa em `analyze` e em `expectEquilibrium`; no `arco-atirantado` com q por projeção, N do tirante = qL²/(8f) (±2%).

- [ ] Ciclo concluído · commit `feat: arquivo JSON, equações prontas e exemplos`

### Task 9 — Interface: estado, área de desenho, ferramentas Nó e Barra

**Arquivos:** criar `src/ui/state.ts`, `src/ui/format.ts`, `src/ui/App.tsx`, `src/ui/Toolbar.tsx`, `src/ui/Canvas.tsx`, `src/ui/StatusBar.tsx`, `src/ui/styles.css`, `src/main.tsx`, `tests/state.test.ts`, `tests/format.test.ts`.

**Produz:**
```ts
type Tool = 'select' | 'node' | 'bar' | 'arc';
type View = 'model' | 'reactions' | 'N' | 'Q' | 'M' | 'deformed';
type Selection = { kind: 'node' | 'member'; id: Id } | null;
interface UiState { model: Model; past: Model[]; future: Model[]; tool: Tool; selection: Selection;
  view: View; grid: number; snap: boolean; barStart: Id | null; scale: number; showValues: boolean }
type Action = { type: 'apply'; fn: (m: Model) => Model } | { type: 'undo' } | { type: 'redo' }
  | { type: 'load'; model: Model } | { type: 'setTool'; tool: Tool } | { type: 'select'; selection: Selection }
  | { type: 'setView'; view: View } | { type: 'set'; patch: Partial<Pick<UiState, 'grid' | 'snap' | 'barStart' | 'scale' | 'showValues'>> };
function reducer(s: UiState, a: Action): UiState;
function parseNumber(text: string): number | null;          // aceita "2,5", "2.5", "-1e3"
function formatNumber(v: number, digits: number): string;   // vírgula decimal
```
Área de desenho em SVG: grade (0,1 / 0,25 / 0,5 / 1 m), snap, zoom na roda centrado no cursor, deslocamento arrastando com o botão do meio ou espaço + arrastar, botão "Enquadrar". Nó: clique cria. Barra: clique no nó inicial e no final (ponto vazio cria o nó). Selecionar: clique em nó ou barra; `Delete` apaga; `Esc` cancela; `Ctrl+Z` / `Ctrl+Y`. Símbolos de apoio, setas de carga e rótulas desenhados sobre o modelo. Atributos `data-testid`: `canvas`, `tool-<tool>`, `tab-<view>`, `status`.

**Testes:** `apply` empilha em `past` e limpa `future`; `undo`/`redo` restauram; `load` limpa o histórico e a seleção; `apply` que remove o item selecionado limpa a seleção; `parseNumber("2,5") = 2.5`, `parseNumber("abc") = null`; `formatNumber(1234.5, 2) = "1234,50"`.

- [ ] Ciclo concluído · conferir no navegador (`npm run dev`) criação de nós e barras · commit `feat: área de desenho e ferramentas básicas`

### Task 10 — Interface: painéis de propriedades

**Arquivos:** criar `src/ui/panels/NodePanel.tsx`, `MemberPanel.tsx`, `SectionsPanel.tsx`; alterar `App.tsx`.

**Consome:** operações de T2, `parseNumber`/`formatNumber` (T9).

- Nó: coordenadas; apoio com atalhos (livre, 1º gênero em X, 1º gênero em Y, 2º gênero, engaste) e caixas X/Y/rotação; mola e recalque por direção; carga nodal Fx, Fy, Mz.
- Barra/arco: seção; rótula no início e no fim; lista de cargas distribuídas (direção, "por comprimento" ou "por projeção", valor inicial e final, botão para tornar uniforme); botão "Inserir nó" (fração para barra, x para arco).
- Seções: lista com nome, E (GPa), tipo e dimensões em cm; A e I calculados exibidos; seção em emprego não pode ser apagada.
- Campo com valor inválido fica destacado e não altera o modelo.

- [ ] Conferir no navegador: montar a viga biapoiada do T6 só pela interface e ver `status` = "Análise concluída" · commit `feat: painéis de propriedades`

### Task 11 — Interface: arcos

**Arquivos:** criar `src/ui/panels/ArcForm.tsx`; alterar `Canvas.tsx`, `MemberPanel.tsx`.

**Consome:** `addArc`, `updateArc`, `splitMember` (T2), `arcPoints` (T5), equações prontas (T8).

- Ferramenta Arco abre o formulário: campo `y =`, x inicial, x final, nº de segmentos, seção; seletor "Modelo pronto" (parábola, circular, catenária) com vão, flecha e ponto inicial, que preenche a equação.
- Pré-visualização tracejada na área de desenho enquanto se digita; erro da equação exibido sob o campo, com a posição.
- "Criar arco" chama `addArc`. No painel do arco selecionado, os mesmos campos chamam `updateArc`.
- Arco desenhado como curva suave (200 pontos), independente do número de segmentos de cálculo.

- [ ] Conferir no navegador: criar o arco parabólico de T7, dividir em x=10, pôr rótula, aplicar q por projeção · commit `feat: modelagem de arcos por equação`

### Task 12 — Interface: resultados

**Arquivos:** criar `src/ui/ResultsLayer.tsx`, `src/ui/panels/ResultsTable.tsx`; alterar `App.tsx`, `StatusBar.tsx`.

**Consome:** `analyze` (T6), `memberStations`, `extremes` (T7).

- Análise recalculada a cada alteração do modelo (memorizada). `status`: "Análise concluída" ou a primeira mensagem de erro; clicar na mensagem seleciona o item com problema.
- Abas N, Q, M: polígono preenchido ao longo de cada barra e de cada arco; N e Q positivos do lado +y local, M do lado tracionado; escala automática (maior ordenada = 12% da maior dimensão do modelo) multiplicada pelo controle deslizante; valores nas extremidades e nos extremos internos quando "valores" está marcado.
- Reações: setas e valores nos apoios. Deformada: curva deslocada com fator automático (maior deslocamento = 5% da maior dimensão) e fator exibido.
- Consulta: passar o cursor sobre um elemento mostra N, Q, M, dx, dy na estação mais próxima.
- Tabela (`data-testid="results-table"`): reações por nó e extremos por elemento.

- [ ] Conferir no navegador os cinco exemplos em todas as abas · commit `feat: visualização de resultados`

### Task 13 — Arquivo, exportação, build único e teste de ponta a ponta

**Arquivos:** criar `src/ui/export.ts`, `scripts/smoke.mjs`, `README.md`, `docs/index.html` (gerado); alterar `Toolbar.tsx`, `vite.config.ts`.

- Novo, Abrir (`parseModel`, erro em aviso sem perder o modelo atual), Salvar (`arcada-modelo.json`), menu Exemplos (`data-testid="example-<slug>"`), gravação automática em `localStorage` com leitura protegida por `try/catch`.
- Exportar PNG da vista atual (SVG → canvas, escala 2×) e CSV das estações (`elemento;s;x;y;N;Q;M;dx;dy`, vírgula decimal, separador `;` para abrir direto no Excel em português).
- `npm run build` gera `docs/index.html` com tudo embutido.
- `README.md`: como abrir, como montar um arco, convenções de sinal e unidades, limitações da v1, como desenvolver (`npm install`, `npm run dev`, `npm test`, `npm run build`).
- `scripts/smoke.mjs` (Playwright global, Chromium já instalado): abre `docs/index.html` por `file://`; para cada exemplo, clica em `example-<slug>` e espera `status` = "Análise concluída"; no `arco-parabolico-biarticulado` lê a reação horizontal na tabela e compara com qL²/(8f) (±0,5%); grava capturas das abas M e Deformada na pasta temporária da sessão; falha se houver erro no console.

- [ ] `npm test` e `node scripts/smoke.mjs` verdes; capturas revisadas · commit `feat: arquivo, exportação e build único`

---

## Verificação

1. `npm test` — todos os testes do núcleo (soluções analíticas de vigas, pórticos, treliça e seis casos de arco) passam.
2. `npm run build` e `node scripts/smoke.mjs` — a aplicação abre por `file://`, os cinco exemplos calculam, a reação horizontal do arco bate com qL²/(8f), nenhuma mensagem de erro no console.
3. Revisão visual das capturas: diagrama de M do lado tracionado, deformada coerente, arco suave.
4. Revisão independente do código (agente revisor) antes da entrega.
5. Sugestão para vocês: comparar `viga-biapoiada` e `portico-plano` com o Ftool — os valores devem coincidir.

## Entrega e repositório

- **Acesso de escrita ao GitHub está pendente:** a tentativa de ligar o repositório com permissão de envio falhou porque a conta GitHub não está conectada ao Claude. Correção: conectar em https://claude.ai/connect-github e instalar o Claude GitHub App no repositório `jeanemerick/Jean-Rafa-Test`. A leitura já funciona (repositório público).
- Primeiro passo da execução: tentar de novo o acesso de escrita. Com acesso: clonar em `/home/user/jean-rafa-test`, criar o ramo `claude/analise-estrutural-2d`, enviar a cada tarefa concluída. Sem acesso: trabalhar no clone de leitura em `/home/user/jeanemerick/jean-rafa-test`, com commits locais, e enviar assim que o acesso existir.
- Como o contêiner é temporário, ao final envio pela sessão o `docs/index.html` pronto e, se o envio ao GitHub continuar bloqueado, um `.zip` com o código-fonte.
- Não abro pull request sem pedido de vocês.
- Opcional depois: ativar o GitHub Pages na pasta `docs/` para ter a aplicação num link público.
