# PROMPT-MESTRE — StructAN-Arch-2D, segunda etapa

> **Como iniciar (para o Jean):** abra um agente novo no Claude Code com este repositório, de preferência no ambiente "StructAN-Arch-2D". Cole este texto inteiro, ou escreva "leia PROMPT-MESTRE.md na raiz do repositório e execute". Anexe de novo as três imagens de referência (arco com carga em faixa reta, pórtico com tirantes e rótulos sobrepostos).

## 1. Missão

Você vai continuar o desenvolvimento do **StructAN-Arch-2D**, uma aplicação web de análise estrutural 2D (vigas, pórticos, treliças e arcos definidos por equação) criada por Jean Emerick e um colega, engenheiros habituados ao Ftool. A primeira etapa está pronta e publicada. Nesta etapa você corrige os problemas e implementa as melhorias da seção 5, sem perder nada do que já funciona.

Pronto significa: os 18 itens atendidos com teste, suíte verde, site publicado conferido e um relatório final com as decisões que você tomou.

## 2. Onde estamos

**Repositório:** `github.com/jeanemerick/StructAN-Arch-2D` (antes `Jean-Rafa-Test`; o nome antigo redireciona e pode ser o que aparece anexado à sessão). Os ramos `main` e `claude/analise-estrutural-2d` estão no mesmo commit.

**Site público:** https://jeanemerick.github.io/StructAN-Arch-2D/ — o GitHub Pages serve o ramo `main`, pasta `/docs`. Publicar é enviar ao `main` um `docs/index.html` regenerado. O ambiente de nuvem "StructAN-Arch-2D" libera `jeanemerick.github.io` para você conferir o site.

**Página no Claude (opcional):** https://claude.ai/artifact/1KpEUV5qLNPrCi8j9Srstm, gerada por `npm run build:artifact`. Para atualizá-la a partir de outra conversa é preciso informar esse endereço na publicação.

**Tecnologias:** TypeScript, React 18, Vite 5, Vitest 2, `vite-plugin-singlefile`. Node 22.

**Comandos:** `npm install`, `npm test` (144 testes), `npm run typecheck`, `npm run build` (gera `docs/index.html`), `npm run smoke` (ponta a ponta no Chromium já instalado), `npm run build:artifact`, `npm run dev`.

**Mapa do código:**

```
app.html                    entrada de desenvolvimento (Vite)
index.html                  página da raiz: só redireciona para docs/index.html
docs/index.html             build único publicado
src/expr/parser.ts          interpretador de y = f(x) (compileExpr), sem eval
src/model/types.ts          Model (version 1): Node, Support, NodalLoad, Section/Shape, DistLoad, Bar, Arc
src/model/ops.ts            operações puras: addNode, addBar, addArc, updateArc, splitMember, updateNode, setSupport…
src/model/curve.ts          compileArcCurve: domínio e continuidade da equação do arco
src/model/validate.ts       validateModel → erros e avisos
src/model/io.ts             serialize / parseModel (JSON)
src/model/presets.ts        parabola, circular, catenary (equação a partir de vão e altura)
src/model/examples.ts       cinco exemplos
src/solver/element.ts       rigidez local, cargas equivalentes, condensação de rótulas
src/solver/skyline.ts       reordenação RCM + LDLᵀ em perfil
src/solver/mesh.ts          buildMesh, arcPoints (trechos de mesmo comprimento de arco), conversão de cargas
src/solver/analyze.ts       analyze(model): deslocamentos, esforços de extremidade, reações, avisos
src/solver/diagrams.ts      memberStations (N, Q, M, dx, dy por estação), extremes
src/ui/App.tsx              estado geral, atalhos de teclado, abas laterais, arquivo e exportação
src/ui/state.ts             reducer: desfazer/refazer, ferramenta, seleção (hoje de um item só), vista
src/ui/Canvas.tsx           desenho SVG, cliques, snapPoint, resolveNode, GridLayer, LoadsLayer
src/ui/ResultsLayer.tsx     diagramas N/Q/M, deformada, reações, consulta por ponto
src/ui/Toolbar.tsx          barra superior e ferramentas (grade e snap)
src/ui/StatusBar.tsx        abas de vista, escala, status e avisos
src/ui/panels/              NodePanel, MemberPanel, ArcForm, SectionsPanel, ResultsTable
src/ui/geometry.ts          transformações de tela, hitTest, snapAlongMember
src/ui/widgets.tsx          NumField (vírgula decimal; confirma ao sair do campo ou com Enter)
src/ui/saver.ts, export.ts  salvar arquivos, PNG e CSV
src/ui/styles.css           tema claro e escuro por variáveis, layout responsivo
tests/                      Vitest; tests/helpers.ts tem expectEquilibrium e modelos de apoio
scripts/smoke.mjs           teste de ponta a ponta sobre docs/index.html
scripts/build-artifact.mjs  versão para página hospedada no claude.ai
```

**Convenções em vigor (não mudar sem motivo):**
- Eixos globais: X para a direita, Y para cima, rotação anti-horária positiva. Carga gravitacional tem valor negativo em Y.
- Eixo local: x do nó inicial ao final; y a 90° anti-horário. Arcos sempre da esquerda para a direita.
- N > 0 tração. Q > 0 gira o trecho no sentido horário. M > 0 traciona a fibra do lado −y local; o diagrama de M é desenhado do lado tracionado.
- Unidades internas: kN, m, rad. Entrada: E em GPa, seção em cm, molas em kN/m e kN·m/rad, recalques em mm. Saída: kN, kN·m, deslocamentos em mm.
- Análise linear elástica, Euler–Bernoulli, 3 graus de liberdade por nó; arcos discretizados em trechos retos, com N e Q projetados na tangente real da curva.

## 3. Regras fixas

- `src/expr`, `src/model` e `src/solver` não importam nada de `src/ui` nem do DOM.
- Equação avaliada pelo interpretador próprio; nada de `eval` ou `new Function`.
- Interface, mensagens e manual em pt-BR. Entrada numérica aceita vírgula ou ponto; exibição com vírgula.
- As preferências pessoais de vocabulário do Jean (registradas na conta dele) valem também para textos da interface, mensagens, README e manual.
- `docs/index.html` continua autocontido, sem rede, abrindo por `file://`.
- Sem dependências novas, salvo necessidade real e justificada no relatório.
- A página também roda hospedada no claude.ai: sem `alert`, `confirm`, `prompt` ou impressão; arquivos saem por `src/ui/saver.ts`; cores só por variáveis do tema (claro e escuro); campos com `id` estável; atalhos de teclado desligados apenas dentro de campos de texto (`src/ui/hotkeys.ts`).
- Arquivos de modelo antigos continuam abrindo: ao mudar o formato, suba para `version: 2` e migre a versão 1 em `parseModel`, com teste.
- Não reescreva histórico do git. Não abra pull request sem pedido.

## 4. Sequência de trabalho (a mesma da primeira etapa)

1. **Reconhecimento.** Leia `README.md`, `src/model/types.ts`, `src/solver/` e `src/ui/`. Rode `npm install`, `npm test`, `npm run build` e `npm run smoke` para confirmar o ponto de partida verde.
2. **Diagnóstico primeiro.** Comece pelo grupo A da seção 5: reproduza os dois problemas de resultado antes de alterar qualquer coisa.
3. **Plano por tarefas.** Apresente ao Jean um plano curto, na ordem dos grupos A a E, e peça aprovação. Faça poucas perguntas: só o que mudar o resultado. No restante, decida, registre a decisão e siga.
4. **Execução.** Uma tarefa por vez, com o teste escrito e falhando antes do código. Commit por tarefa, no ramo `claude/etapa-2`, criado a partir do `main`. Envie o ramo ao GitHub com frequência: o contêiner é temporário.
5. **Verificação.** `npm test`, `npm run typecheck`, `npm run build`, `npm run smoke`, e conferência visual no Chromium em computador e celular, nos temas claro e escuro. Atualize o `smoke.mjs` para os fluxos novos.
6. **Revisão independente.** Ao final, um revisor com contexto novo lê o ramo inteiro; corrija o que for crítico ou importante, com teste.
7. **Publicação.** Com tudo verde, avance o `main` (sem reescrever histórico), espere um ou dois minutos e abra o site publicado para conferir. O Jean já autorizou essa publicação.
8. **Relatório final.** O que foi feito, como foi conferido, decisões que você tomou pelo Jean e o que ficou para depois.

## 5. Mudanças desta etapa

Os números entre colchetes são os itens da lista original do Jean (tabela na seção 10).

### Grupo A — Confiabilidade dos resultados (fazer primeiro)

**A1. Arco biapoiado com força concentrada no meio do vão [5].** O Jean suspeita de resultados incoerentes e não lembra como criou o nó da força.

- *Causa provável, já vista no código:* `analyze()` só aplica cargas nodais a nós presentes em `mesh.nodeIndex`, e `buildMesh` deixa de fora o nó que não está ligado a nenhuma barra. `updateNode` muda as coordenadas sem ligar o nó à barra ou ao arco onde ele cai. Assim, quem cria um nó num ponto qualquer e depois digita as coordenadas do meio do vão fica com um nó em cima do arco, porém solto: a força é ignorada e a análise termina como "concluída", só com um aviso na barra de status.
- *O que fazer:* reproduza os três caminhos de criação do nó (clicar e corrigir coordenadas; clicar com a ferramenta Nó sobre o arco; "Inserir nó" no painel do arco) e compare cada um com os valores da seção 6.
- *Comportamento esperado:* nó que passa a cair sobre uma barra ou arco (por clique, por coordenadas ou por edição) é ligado a ele automaticamente (`splitMember`); nó que cai sobre outro nó se funde com ele; carga ou apoio em nó sem barra vira erro que impede a análise, com mensagem clara, nunca um resultado silenciosamente errado.
- *Aceite:* testes automáticos dos casos 6.1 a 6.4 passando, mais um teste por caminho de criação do nó. Se houver erro de cálculo de verdade, corrija-o e explique no relatório; se não houver, diga isso com os números.

**A2. Esforço normal com aparência descontínua [9].** O Jean não soube dizer onde. Investigue.

- *Onde olhar:* `arcStations()` em `src/solver/diagrams.ts` (N e Q pela tangente real, derivada lateral nas extremidades) e o desenho em `src/ui/ResultsLayer.tsx`, que hoje fecha o contorno de cada barra até o eixo nas duas pontas (`outline`) e pinta um quadrilátero por trecho.
- *Modelos para reproduzir:* os arcos da seção 6, um arco dividido em vários nós sem carga neles, um semicírculo e o pórtico da imagem 2.
- *Comportamento esperado:* onde o eixo não muda de direção e não há carga axial, apoio nem mudança de tipo de barra, N é contínuo, em número e em desenho: sem parede de fechamento em nó que só divide o elemento, sem emendas visíveis entre trechos (um único contorno por trecho de mesmo sinal). Onde o salto é físico, ele aparece com os dois valores legíveis (ver D5).
- *Aceite:* teste numérico de continuidade de N nos nós internos de arcos divididos; capturas de tela antes e depois no relatório.

### Grupo B — Modelo e cálculo

**B1. Comportamento por barra [10].** Hoje toda barra é de pórtico (EA + EI) com rótulas opcionais nas pontas (`hingeI`, `hingeJ`).

- Acrescente a cada barra o campo de tipo, com três opções:
  - **Pórtico** (padrão): EA e EI, como hoje.
  - **Somente axial (tirante/escora):** só EA; sempre birrotulada; não transmite flexão aos demais elementos. É o caso das barras "EA" da imagem 2.
  - **Somente flexão:** só EI; a deformação axial é desprezada (barra inextensível). A deformação por cortante já é desprezada pela teoria adotada.
- Rótulas por extremidade continuam valendo para Pórtico e Somente flexão. Arcos aceitam Pórtico e Somente flexão.
- *Cálculo:* para a barra axial, monte a rigidez só com os termos axiais (não passe por `condense` com EI nulo). Para a inextensível, adote rigidez axial de penalidade ou restrição cinemática e confira o condicionamento; documente a escolha. O travamento automático da rotação em nós onde nenhuma barra dá rigidez à rotação já existe em `analyze.ts`.
- Carga transversal distribuída em barra somente axial: erro de validação com orientação ("aplique nos nós ou mude o tipo").
- *Tela:* seletor "Tipo de barra" no painel da barra, com uma linha de explicação; desenho distinto para cada tipo (a axial com traço fino e rótulas nas pontas, como na imagem 2).
- *Aceite:* barra axial dá o mesmo resultado que barra de pórtico com as duas rótulas; pórtico com barras inextensíveis bate com a solução manual pelo método dos deslocamentos (deduza a referência de forma independente; para pórtico biengastado com carga lateral P no nível da viga, a literatura dá M na base = (P·h/2)·(3k+1)/(6k+1), com k = (I_viga/L)/(I_pilar/h) — confira antes de adotar); o pórtico da imagem 2 analisa e fecha o equilíbrio.

**B2. Rigidez informada diretamente [12].** Hoje a seção é E + forma (retangular, circular ou genérica com A e I).

- Acrescente o tipo de seção "Rigidez direta", com EA (kN) e EI (kN·m²) digitados. Barra somente axial exige apenas EA; somente flexão, apenas EI.
- Ajuste `sectionProps`, validação, `SectionsPanel` e a migração do arquivo.
- *Aceite:* viga com EI digitado reproduz a flecha 5qL⁴/(384EI); arquivo salvo e reaberto mantém os valores.

**B3. Análise térmica [13].**

- *Material:* coeficiente de dilatação térmica α (1/°C) na seção, com padrão 1,0×10⁻⁵.
- *Carga por barra:* variação de temperatura da face externa e da face interna, em °C, em relação à temperatura de referência. Face externa = lado +y local (face superior; extradorso no arco); face interna = lado −y. Parte uniforme = média das duas; gradiente = (interna − externa)/h. A altura h vem da forma da seção; em seção genérica ou de rigidez direta, peça h quando houver gradiente. Confirme esta leitura com o Jean no plano.
- *Cálculo:* cargas nodais equivalentes em `element.ts`/`mesh.ts`; nos diagramas e na deformada, inclua as deformações térmicas (u′ = N/EA + αΔT; v″ = M/EI + α(T_int − T_ext)/h).
- *Aceite:* viga biapoiada com gradiente: esforços nulos e flecha no meio de módulo κL²/8, com κ = α(T_int − T_ext)/h; biengastada com aquecimento uniforme: N = −EAαΔT e deslocamento nulo; biengastada com gradiente: M constante de módulo EIκ e flecha nula; arco biarticulado com aquecimento uniforme: empuxo igual ao obtido por quadratura independente do método das forças (tolerância 1%).

### Grupo C — Modelagem

**C1. Coordenadas livres [2].** Hoje a grade só oferece 0,1 / 0,25 / 0,5 / 1 m (`ToolPanel` em `Toolbar.tsx`) e `snapPoint` arredonda para ela.

- Troque a lista por um campo numérico de passo da grade que aceite qualquer decimal positivo (0,01; 0,1; 1; 2,5…). O snap continua podendo ser desligado.
- Com o snap desligado, a coordenada do clique é arredondada ao milímetro, para não nascerem valores como 7,560027533. Coordenadas digitadas ficam como foram digitadas.
- A barra de status mostra a posição do cursor com três casas.
- *Aceite:* criar nós em (0,01; 0,37) e (2,345; 1,2) pelo mouse com passo 0,01 e por digitação.

**C2. Nó por coordenadas [7].** Hoje é preciso clicar num ponto qualquer e depois corrigir X e Y no painel.

- Ao clicar em "Nó", abra uma lista com duas opções: **Clicar no desenho** e **Informar coordenadas**.
- Em "Informar coordenadas": campos X e Y no painel, marcador de pré-visualização no desenho, Enter ou botão cria o nó e o foco volta ao X para o próximo.
- O nó criado sobre uma barra ou arco já nasce ligado (regra de A1); sobre um nó existente, apenas o seleciona.

**C3. Enter aplica [8].** Todo formulário de criação ou edição confirma com Enter: novo arco, aplicar ao arco, nó por coordenadas, inserir nó, duplicar. Esc cancela. Enter dentro de um campo confirma o valor do campo e envia o formulário.

**C4. Arco entre dois nós [16].** Hoje `ArcForm.tsx` pede x inicial, y das nascenças, vão e altura e gera a equação em coordenadas globais; o arco nasce onde esses números mandarem, sem relação com os nós já desenhados.

- Novo fluxo padrão: escolher o **nó inicial** e o **nó final** (clicando em nós ou pontos, ou digitando coordenadas), informar a **altura do arco** e a **forma** (parábola, circular ou catenária). A equação é gerada sozinha e o arco fica preso a esses nós. Se os nós forem escolhidos da direita para a esquerda, inverta a ordem.
- Nascenças em níveis diferentes: obrigatório funcionar para a parábola (altura medida a partir da corda, no meio do vão); para circular e catenária, se não for viável, mensagem clara.
- Guarde no modelo os parâmetros geradores (forma e altura), para o arco se refazer quando um nó de extremidade mudar de posição. Hoje as coordenadas desses nós ficam bloqueadas no painel.
- A equação livre y = f(x) continua disponível como opção avançada: é o recurso de origem do programa.
- *Aceite:* criar o arco da imagem 1 (nós em (0; 0) e (6; 0), altura 1,5, parábola) em poucos passos; mover um nó de extremidade refaz o arco.

**C5. "Altura do arco" no lugar de "flecha" [6].** Nas propriedades e mensagens do arco, troque "flecha" por "altura do arco" (o símbolo f pode ficar, como na imagem 1): `ArcForm.tsx`, textos de `App.tsx`, mensagens de `presets.ts`, README e os testes que procuram a palavra. "Flecha" fica reservada a deslocamento vertical.

**C6. Seleção múltipla e duplicação [17].** Hoje a seleção é de um item só (`Selection` em `state.ts`).

- Seleção de vários nós e barras: Shift+clique, janela de seleção e Ctrl+A.
- Comando **Duplicar** (botão e Ctrl+D): copia barras, arcos e seus nós com apoios, cargas, rótulas, tipos, seções e temperatura. A cópia fica na mesma janela, deslocada para o lado com folga suficiente para os diagramas das duas não se sobreporem. O deslocamento sugerido pode ser editado antes de confirmar (Enter). Depois, a vista se enquadra para mostrar tudo e a cópia fica selecionada. Desfazer remove a cópia num passo só.
- O solver já aceita estruturas separadas no mesmo modelo; confirme com teste.
- *Aceite:* duplicar a viga do exemplo, trocar um apoio da cópia e ver os dois diagramas lado a lado, sem sobreposição.

### Grupo D — Resultados na tela

**D1. Carga distribuída em linha reta [1].** Hoje `LoadsLayer` (em `Canvas.tsx`) desenha toda carga acompanhando o eixo; no arco, a carga vertical faz a curva do arco.

- Novo modo padrão para cargas em direção global: a carga vertical é desenhada numa faixa reta horizontal acima do elemento, cobrindo a projeção dele, com setas de mesmo espaçamento (imagem 1 e carga "xy" da imagem 2). A carga horizontal vai numa faixa reta vertical ao lado do elemento (carga "xz" da imagem 2).
- A altura das setas representa a intensidade por metro de projeção. Em carga "por comprimento", converta para o valor equivalente por projeção, para o desenho não mentir; se a projeção for nula (barra vertical com carga vertical), desenhe sobre o elemento.
- Trechos vizinhos com a mesma carga (um arco dividido em dois, por exemplo) formam uma faixa contínua no mesmo nível. Faixas não cobrem barras nem umas às outras.
- Cargas em direção local (normal ou tangente) continuam sobre o elemento. Ofereça uma opção de vista para voltar ao desenho antigo.
- *Aceite:* a tela do arco da imagem 1 e a do pórtico da imagem 2 ficam parecidas com as figuras.

**D2. Reações junto dos diagramas [3].** Hoje as reações só aparecem na vista "Reações". Mostre setas e valores das reações também nas vistas N, Q e M, com uma caixa "Reações" para ligar e desligar (ligada por padrão) e sem colidir com os rótulos dos diagramas.

**D3. Voltar ao modelo [4].** Esc numa vista de resultado volta para "Modelo". Ordem do Esc: cancela a barra em construção; fecha menu ou formulário aberto; sai da vista de resultado; limpa a seleção. Escolher uma ferramenta de modelagem (Nó, Barra, Arco) numa vista de resultado também volta ao modelo.

**D4. Extremos bem identificados [11].** Em N, Q e M, marque com destaque o maior valor positivo e o maior negativo da estrutura (marcador, valor e etiqueta "máx" / "mín") e, com menos peso, os extremos de cada barra. Em barras, calcule o extremo exato (M onde Q = 0, por exemplo), não por amostragem; hoje `ResultsLayer` e `extremes()` amostram 40 estações.

**D5. Valores em descontinuidades [15].** Na imagem 3, os valores dos dois lados de um nó (−13,00 e −18,00) ficam empilhados e não se sabe qual é de qual barra. Posicione cada valor do lado da sua barra, afastado do nó ao longo dela, com um pequeno traço de chamada; evite colisão entre rótulos; valores iguais dos dois lados viram um rótulo só.

**D6. Sem a aba "Resultados" [14].** Remova a aba lateral e `ResultsTable`. Os avisos da análise passam a ser listados a partir da barra de status. A exportação CSV continua. O `smoke.mjs` lê hoje a reação nessa tabela (`reaction-n1-fx`): troque a fonte da leitura.

### Grupo E — Ajuda e documentação

**E1. Aba de ajuda com manual [18].** Crie "Ajuda", aberta numa área larga dentro da própria página (o painel lateral é estreito; não há janela nova nem impressão). Conteúdo em pt-BR, com índice e busca, escrito por você, com a estrutura típica dos manuais de programas consagrados (o do Ftool é a referência natural), sem copiar texto deles:

- visão geral e primeiro modelo passo a passo (viga, pórtico, arco);
- ferramentas, atalhos, grade e coordenadas;
- apoios, molas, recalques, rótulas e tipos de barra;
- cargas: tipos, sinais, por comprimento e por projeção, temperatura;
- seções e materiais, incluindo rigidez direta;
- leitura dos resultados e convenções de sinal, com figuras em SVG;
- boas práticas de modelagem: estabilidade e mecanismos, onde pôr rótulas, número de segmentos do arco, unidades, conferência do equilíbrio, erros comuns;
- mensagens do programa e como resolver; limitações; exemplos resolvidos.

**E2. Exemplos e README.** Acrescente dois exemplos: o arco triarticulado da imagem 1 e o pórtico de duas águas com tirantes da imagem 2 (as cargas da figura são simbólicas: adote 10 kN/m na água esquerda e 5 kN/m no pilar direito e diga isso no nome). Atualize o README.

## 6. Casos de referência

Recalcule cada valor de forma independente (equilíbrio à mão ou quadratura dentro do próprio teste) antes de confiar nele. Parábola y = x(6 − x)/6: vão L = 6 m, altura f = 1,5 m, tangente tan α = 1 − x/3. Tolerâncias com 40 segmentos por metade: reações 0,1%; N, Q e M 1% (0,5 kN·m quando o valor esperado é nulo).

**6.1 Biapoiado (2º gênero em A, 1º gênero em B), P = 100 kN no fecho.** R_A = R_B = 50; H = 0. Para x ≤ 3: M = 50x; N = −50 sen α; Q = +50 cos α.

| x (m) | N (kN) | Q (kN) | M (kN·m) |
|---|---|---|---|
| 0 | −35,36 | +35,36 | 0 |
| 1,5 | −22,36 | +44,72 | 75 |
| 3 (esquerda) | 0 | +50 | 150 |
| 3 (direita) | 0 | −50 | 150 |

Metade direita: N e M simétricos, Q antissimétrico.

**6.2 Triarticulado (2º gênero em A e B, rótula no fecho), P = 100 kN no nó do fecho.** H = P·L/(4f) = 100; R_A = R_B = 50. Para x ≤ 3: M = 50x − 100y; N = −(100 cos α + 50 sen α); Q = 50 cos α − 100 sen α.

| x (m) | N (kN) | Q (kN) | M (kN·m) |
|---|---|---|---|
| 0 | −106,07 | −35,36 | 0 |
| 1,5 | −111,80 | 0 | −37,5 (mínimo) |
| 3 (esquerda) | −100 | +50 | 0 |

**6.3 Biarticulado (2º gênero em A e B, sem rótula), P = 100 kN no fecho, EI constante.** Empuxo pelo método das forças, por quadratura independente do solver: H = ∫M₀·y ds / ∫y² ds, com ds = √(1 + y′²) dx. Compare com o programa numa seção de EA muito alto (tolerância 1%). A fórmula clássica H = 25PL/(128f) = 78,125 só vale para inércia variável I = I_c·sec α; não serve de referência para EI constante.

**6.4 Arco da imagem 1: triarticulado, q = 10 kN/m por projeção.** H = qL²/(8f) = 30; R_A = R_B = 30; M ≈ 0 em todo o arco; N no fecho = −30; N na nascença = −42,43.

**6.5 Já cobertos pelos testes atuais, devem continuar passando:** semicírculo biarticulado com P no fecho (H = P/π), triarticulado (H = P/2), arco circular sob pressão normal (N = −pR), catenária sob peso próprio.

## 7. Pendências menores herdadas da primeira etapa

Resolva as que cruzarem o seu caminho; as demais entram no relatório como "para depois".

- "Novo" e "Exemplos" descartam o modelo sem confirmação (a confirmação precisa ser da própria página).
- Saltos em degrau na equação (`x/abs(x)`) passam pela checagem da curva.
- `parseModel` aceita identificadores repetidos; mola negativa conta como apoio na validação; recalque em direção livre é ignorado sem aviso.
- No formulário do arco, erro do modelo pronto mantém a equação anterior com o botão ativo.
- `splitMember` pode lançar exceção num clique sobre arco de equação inválida; não há barreira de erro no React.
- A mensagem de instabilidade aponta onde o cálculo travou, nem sempre a causa.
- Faltam testes da lógica de clique do `Canvas`.
- `docs/superpowers/` (plano antigo) está dentro da pasta publicada pelo Pages; mova para fora de `docs/`.

## 8. Publicação e entrega

- Site: `npm run build`, commit de `docs/index.html`, `main` atualizado, conferência do endereço público num navegador (no Chromium daqui, passe o proxy do ambiente em `chromium.launch`).
- Página no Claude: se você tiver a ferramenta de publicação, regenere com `npm run build:artifact` e publique informando o endereço da seção 2.
- Relatório final ao Jean, em linguagem simples: o que mudou na tela, como foi conferido, as decisões que você tomou e o que ficou para depois.

## 9. Imagens de referência

O Jean deve anexar as três imagens ao iniciar. Caso não venham, estas descrições bastam:

- **Imagem 1 — arco com carga em faixa reta.** Arco triarticulado (rótulas em A, B e no fecho C), vão ℓ = 6 m, altura f = 1,5 m, apoios de 2º gênero com empuxo H nas duas nascenças. A carga de 10 kN/m é uma faixa retangular reta e horizontal, acima do arco, do apoio A ao apoio B, com setas verticais iguais e igualmente espaçadas. A carga não acompanha a curva.
- **Imagem 2 — pórtico de duas águas com tirantes.** Três pilares de 4 m, engastados, espaçados de 4 m; o pilar central sobe até a cumeeira, 3 m acima; duas barras inclinadas ligam os topos dos pilares laterais à cumeeira. Essas barras são marcadas "EI". Dois tirantes horizontais marcados "EA", com rótulas nas pontas, ligam os topos dos pilares laterais ao pilar central. Carga vertical "xy" em faixa reta horizontal acima da água esquerda; carga lateral "xz" em faixa reta vertical ao lado do pilar direito, apontando para a estrutura; recalque de 1 cm no apoio esquerdo, no sentido −Y.
- **Imagem 3 — rótulos sobrepostos.** Recorte de um diagrama no tema escuro: num nó entre dois trechos alinhados há um salto, e os valores "−13,00" e "−18,00" aparecem empilhados sob o nó, sem indicar a que lado cada um pertence.

## 10. Cobertura da lista do Jean

| Item da lista | Seção |
|---|---|
| 1. Carga distribuída em linha reta | D1 |
| 2. Coordenadas decimais livres | C1 |
| 3. Reações junto de N, Q e M | D2 |
| 4. Voltar dos resultados ao modelo (Esc) | D3 |
| 5. Verificar arco biapoiado com força no meio | A1, seção 6 |
| 6. "Altura do arco" no lugar de "flecha" | C5 |
| 7. Nó por coordenadas, com lista ao clicar em "Nó" | C2 |
| 8. Enter aplica o elemento | C3 |
| 9. Esforço normal contínuo | A2 |
| 10. Comportamento por barra (axial, flexão) | B1 |
| 11. Extremos identificados nos diagramas | D4 |
| 12. EI e EA informados diretamente | B2 |
| 13. Análise térmica | B3 |
| 14. Omitir a aba de resultados | D6 |
| 15. Valores em descontinuidades | D5 |
| 16. Modelagem do arco | C4 |
| 17. Duplicar elementos selecionados | C6 |
| 18. Aba de ajuda com manual | E1, E2 |
