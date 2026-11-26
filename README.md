# StructAN-Arch-2D — análise estrutural 2D de pórticos e arcos

Aplicação para análise linear elástica de estruturas reticuladas planas (vigas, pórticos, treliças e **arcos definidos por uma equação y = f(x)**). Calcula reações de apoio, esforço normal (N), esforço cortante (Q), momento fletor (M) e a configuração deformada.

A ideia é a de uma ferramenta no espírito do Ftool, com interface mais enxuta e com o recurso que ele não tem: modelar arcos a partir da relação entre x e y, ou entre dois nós a partir da altura do arco.

O manual completo está dentro do programa, no botão **Ajuda** (ou tecla F1), com índice, busca e figuras.

## Como abrir

O programa inteiro está num único arquivo: **`docs/index.html`**. Basta abri-lo no navegador (Chrome, Edge ou Firefox) com dois cliques — não precisa de instalação nem de internet.

Endereço público: **https://jeanemerick.github.io/StructAN-Arch-2D/**

### Publicar no GitHub Pages

1. No GitHub, abra o repositório e entre em **Settings → Pages**.
2. Em **Source**, escolha **Deploy from a branch**.
3. Em **Branch**, escolha `main` e, ao lado, a pasta **/docs** (a pasta **/ (root)** também funciona: o `index.html` da raiz leva ao programa). Clique em **Save**.
4. Depois de um ou dois minutos, a aplicação fica em `https://<conta>.github.io/<repositório>/`.

A cada envio de código para esse ramo, o endereço é atualizado sozinho.

### Página hospedada no Claude

`npm run build:artifact` gera `dist/structan-arch-2d.html`, a versão preparada para publicar como página (Artifact) no claude.ai. Nela, Salvar e Exportar passam pela confirmação da plataforma, e o tema claro ou escuro acompanha o de quem abre.

## Montando um modelo

| Ferramenta | Atalho | O que faz |
|---|---|---|
| Selecionar | V | Clique num nó ou barra para editar no painel à direita; Shift+clique soma ou retira itens. Arrastar no fundo faz a janela de seleção (da esquerda para a direita: só o que estiver inteiro dentro; da direita para a esquerda: o que ela tocar). |
| Nó | N | Lista com **Clicar no desenho** e **Informar coordenadas** (X e Y digitados, Enter cria e o cursor volta ao X). |
| Barra | B | Clique no ponto inicial e no final; a barra seguinte começa no último nó. Esc ou botão direito encerra. |
| Arco | A | Formulário do arco: nó inicial e nó final (por clique ou coordenadas), altura do arco e forma; ou a equação livre. |
| Duplicar | Ctrl+D | Copia a seleção com apoios, cargas, rótulas, tipos, seções e temperatura, deslocada para o lado com folga para os diagramas. |

Outros atalhos: **F** enquadra o modelo, **Del** exclui a seleção, **Ctrl+A** seleciona tudo, **Ctrl+Z / Ctrl+Y** desfazem e refazem, **Enter** confirma os formulários e **Esc** volta um passo (barra em construção, formulário, vista de resultado, seleção).

- Mover a vista: botão do meio, botão direito ou Espaço + arrastar; no celular, arrastar com o dedo. Roda do mouse: zoom.
- **Grade**: passo livre (0,01; 0,1; 2,5…). Com o snap desligado, o clique é arredondado ao milímetro; coordenadas digitadas ficam como foram digitadas.
- **Ligação automática**: um nó que cai sobre uma barra ou um arco (por clique, por coordenadas ou ao ser movido) passa a ficar ligado a ele; sobre outro nó, os dois se fundem. Carga ou apoio num nó sem barra é erro e impede a análise.

No painel de um **nó**: coordenadas, **rótula no nó**, apoio (livre, 1º gênero vertical ou horizontal, 2º gênero, engaste ou combinação livre de X, Y e rotação), molas, recalques e carga nodal (Fx, Fy, Mz).

**Rótulas**: pelo nó (todas as barras que chegam a ele ficam rotuladas; desenho: uma bolinha vazia única no nó) ou pela extremidade de uma barra (só ela fica rotulada; desenho: bolinha vazia na ponta da barra, afastada do nó — como um tirante preso a um pilar contínuo). Nó sem rótula é desenhado como bolinha cheia.

No painel de uma **barra ou arco**: tipo de barra, seção, rótulas, cargas distribuídas (uniformes ou lineares; vertical ou horizontal global, por comprimento ou por projeção; normal ou tangente ao eixo), temperatura das faces e inserção de nó.

- **Tipo de barra**: **Pórtico** (EA e EI), **Somente axial** (tirante ou escora: só EA, sempre birrotulada) ou **Somente flexão** (só EI, inextensível). Arcos aceitam Pórtico e Somente flexão.
- **Temperatura**: variação na face externa (+y local: topo da barra desenhada da esquerda para a direita, extradorso do arco) e na interna (−y). Parte uniforme = média; gradiente = (interna − externa)/h.

Na aba **Seções**: módulo de elasticidade, coeficiente de dilatação α (padrão 1,0×10⁻⁵/°C) e a geometria — retangular, circular, genérica (A e I) ou **rigidez direta** (EA e EI digitados).

Os resultados aparecem nas abas sob o desenho (**Reações, Normal N, Cortante Q, Momento M, Deformada**). Nas vistas N, Q e M, as reações aparecem junto do diagrama (caixa Reações), o maior valor positivo e o maior negativo ficam marcados com "máx" e "mín", e os valores dos dois lados de um salto ficam cada um do lado da sua barra. Passando o cursor sobre a estrutura, um balão mostra N, Q, M e os deslocamentos no ponto. Avisos e erros da análise ficam listados a partir da barra de status.

As cargas distribuídas em direção global são desenhadas em **faixas retas** (a vertical acima do elemento, a horizontal ao lado), com a altura das setas proporcional à intensidade por metro de projeção. A opção **Cargas sobre o eixo** volta ao desenho antigo.

O modelo fica gravado no navegador automaticamente; **Salvar** e **Abrir** trabalham com arquivos `.json` (versão 3; arquivos das versões 1 e 2 abrem e são convertidos). Novo, Abrir e Exemplos pedem confirmação na própria página quando há alterações. **Exportar** gera a imagem da vista atual (PNG) e a tabela de esforços e deslocamentos (CSV com `;` e vírgula decimal, pronta para planilhas).

## Arcos

**Entre dois nós** (padrão): escolha o nó inicial e o final (clicando no desenho ou digitando as coordenadas), a **altura do arco** f — medida na vertical a partir da corda, no meio do vão — e a forma: **parábola**, **arco circular** ou **catenária**. As três aceitam nascenças em níveis diferentes (o arco circular, enquanto a curva continuar sendo função de x). A equação é gerada sozinha, o arco fica preso aos nós e é refeito quando uma nascença se move.

**Equação livre** (avançado): y = f(x) em coordenadas globais (metros), x inicial e x final (x inicial < x final) e o **número de segmentos** de cálculo (padrão 40, de 4 a 200).

Sintaxe aceita na equação: `x`, números com vírgula ou ponto (`2,5` ou `2.5`), `pi`, `e`, os operadores `+ - * / ^` e as funções `sqrt sin cos tan asin acos atan sinh cosh tanh exp ln log abs` (`log` é base 10). A multiplicação precisa do `*`: escreva `2*x`, não `2x`. Equações com salto (como `x/abs(x)`) são recusadas.

```
4*5*x*(20-x)/20^2          parábola com vão de 20 m e altura do arco de 5 m
sqrt(25-x^2)                semicírculo de raio 5 m (x de -5 a 5)
-10*cosh(x/10)              catenária invertida
```

Arco triarticulado: crie o arco, insira um nó no fecho (painel do arco → Inserir nó), selecione esse nó e marque **Rótula no nó**. Arco atirantado: ligue as nascenças com uma barra **Somente axial** e apoie uma delas num apoio de 1º gênero.

### Como o arco é calculado

A curva é dividida em trechos retos de **mesmo comprimento de arco** (o que funciona inclusive com tangente vertical nas nascenças, como no semicírculo), e cada trecho é um elemento de pórtico. Nos diagramas, N e Q são obtidos projetando a resultante de cada seção na **tangente real da curva**, e não na direção do trecho reto, o que evita o serrilhado da poligonal.

## Convenções e unidades

- Eixos globais: X para a direita, Y para cima, rotação anti-horária positiva. Cargas gravitacionais têm sinal negativo.
- Eixo local de cada barra: x do nó inicial para o final; y a 90° no sentido anti-horário. Arcos sempre da esquerda para a direita.
- **N > 0**: tração. **Q > 0**: gira o trecho no sentido horário. **M > 0**: traciona a fibra do lado −y local (a fibra inferior de uma viga desenhada da esquerda para a direita, a face interna de um arco). O diagrama de momento é desenhado **do lado tracionado**.
- Entrada: m, kN, kN/m, kN·m; E em GPa; dimensões de seção em cm (A em cm², I em cm⁴); EA em kN e EI em kN·m² na rigidez direta; molas em kN/m e kN·m/rad; recalques em mm e rad; temperaturas em °C. Saída: kN, kN·m, deslocamentos em mm.

## Exemplos

No menu **Exemplos**: viga biapoiada, pórtico plano, arco parabólico biarticulado, arco triarticulado, arco atirantado, **arco triarticulado com carga em faixa** (vão 6 m, altura 1,5 m, q = 10 kN/m por projeção: H = 30 kN) e **pórtico de duas águas com tirantes** (águas somente flexão, tirantes somente axiais, 10 kN/m na água esquerda, 5 kN/m no pilar direito e recalque de 1 cm no apoio esquerdo — as cargas da figura de origem são simbólicas).

## Limitações desta versão

Análise linear elástica de primeira ordem, teoria de Euler–Bernoulli (sem deformação por cortante). Ainda não há: linhas de influência, apoios inclinados, casos e combinações de carga, peso próprio automático, seção variável.

## Validação

O núcleo de cálculo é verificado por testes automáticos contra soluções analíticas, entre eles:

- vigas biapoiada, engastada, biengastada, com carga triangular e Gerber; recalque de apoio; apoio elástico;
- treliça e pórtico plano; detecção de estrutura hipostática;
- arco parabólico de 6 m com força no fecho: biapoiado, triarticulado e biarticulado (empuxo comparado com a quadratura do método das forças), pelos três caminhos de criação do nó do fecho;
- arco parabólico triarticulado e biarticulado sob carga uniforme por projeção (H = qL²/8f);
- arco semicircular bi e triarticulado com carga concentrada no fecho (H = P/π e H = P/2);
- arco circular sob pressão normal (N = −pR) e catenária sob peso próprio (M ≈ 0);
- barra somente axial igual à barra de pórtico birrotulada; pórtico biengastado inextensível contra a solução do método dos deslocamentos;
- viga com EI digitado (flecha 5qL⁴/384EI); temperatura: biapoiada com gradiente, biengastada com aquecimento uniforme e com gradiente, arco biarticulado aquecido (quadratura);
- continuidade de N nos nós internos de arcos divididos; extremos exatos (M onde Q = 0);
- convergência do momento máximo com o número de segmentos.

## Desenvolvimento

Requisitos: Node.js 20 ou superior.

```bash
npm install
```

```bash
npm run dev
```

```bash
npm test
```

```bash
npm run build
```

```bash
npm run smoke
```

```bash
npm run build:artifact
```

`npm run dev` abre o servidor de desenvolvimento; `npm test` roda os testes; `npm run build` gera `docs/index.html`; `npm run smoke` abre o arquivo gerado no Chromium (Playwright) e confere os exemplos, os fluxos de modelagem (nó por coordenadas, arco entre nós, duplicar, Enter e Esc), as faixas de carga, as reações e os extremos nos diagramas, as exportações, o tema escuro, a tela de celular e a mensagem de estrutura instável; `npm run build:artifact` gera a versão para página hospedada.

Organização do código:

```
src/expr/      interpretador da equação y = f(x) (sem eval)
src/model/     tipos do modelo, operações (ligação de nós, arcos entre nós, duplicação), validação, arquivo JSON, equações prontas, exemplos
src/solver/    elemento de pórtico, solver em perfil (skyline) com reordenação, malha, análise e diagramas
src/ui/        interface React + SVG (desenho, painéis, faixas de carga, rótulos, ajuda)
tests/         testes automáticos (Vitest)
scripts/       teste de ponta a ponta e versão para página hospedada
docs/          aplicação pronta (arquivo único), publicada pelo GitHub Pages
planejamento/  planos de desenvolvimento
app.html       entrada de desenvolvimento (Vite)
index.html     página da raiz: só redireciona para docs/index.html
```
