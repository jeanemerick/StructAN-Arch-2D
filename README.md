# StructAN-Arch-2D — análise estrutural 2D de pórticos e arcos

Aplicação para análise linear elástica de estruturas reticuladas planas (vigas, pórticos, treliças e **arcos definidos por uma equação y = f(x)**). Calcula reações de apoio, esforço normal (N), esforço cortante (Q), momento fletor (M) e a configuração deformada.

A ideia é a de uma ferramenta no espírito do Ftool, com interface mais enxuta e com o recurso que ele não tem: modelar arcos a partir da relação entre x e y.

## Como abrir

O programa inteiro está num único arquivo: **`docs/index.html`**. Basta abri-lo no navegador (Chrome, Edge ou Firefox) com dois cliques — não precisa de instalação nem de internet.

### Endereço público (GitHub Pages)

Para qualquer pessoa abrir pelo navegador, sem receber arquivo nenhum:

1. No GitHub, abra o repositório e entre em **Settings → Pages**.
2. Em **Source**, escolha **Deploy from a branch**.
3. Em **Branch**, escolha o ramo que contém a pasta `docs/` e, ao lado, a pasta **/docs**. Clique em **Save**.
4. Depois de um ou dois minutos, a aplicação fica em `https://<conta>.github.io/<repositório>/`.

A cada envio de código para esse ramo, o endereço é atualizado sozinho.

### Página hospedada no Claude

`npm run build:artifact` gera `dist/structan-arch-2d.html`, a versão preparada para publicar como página (Artifact) no claude.ai. Nela, Salvar e Exportar passam pela confirmação da plataforma, e o tema claro ou escuro acompanha o de quem abre.

## Montando um modelo

| Ferramenta | Atalho | O que faz |
|---|---|---|
| Selecionar | V | Clique num nó ou barra para editar no painel à direita. Arraste o fundo para mover a vista; roda do mouse para zoom. |
| Nó | N | Clique para criar um nó (com snap na grade). Clique sobre uma barra ou arco para inserir um nó nele. |
| Barra | B | Clique no ponto inicial e no final; a barra seguinte começa no último nó. Esc ou botão direito encerra. |
| Arco | A | Abre o formulário do arco à direita, com pré-visualização tracejada no desenho. |

Outros atalhos: **F** enquadra o modelo, **Del** exclui o item selecionado, **Ctrl+Z / Ctrl+Y** desfazem e refazem.

No painel de um **nó**: coordenadas, apoio (livre, 1º gênero vertical ou horizontal, 2º gênero, engaste ou combinação livre de X, Y e rotação), molas, recalques e carga nodal (Fx, Fy, Mz).

No painel de uma **barra ou arco**: seção, rótulas no início e no fim, cargas distribuídas (uniformes ou lineares; vertical ou horizontal global, por comprimento ou por projeção; normal ou tangente ao eixo) e inserção de nó.

Na aba **Seções**: módulo de elasticidade e geometria (retangular, circular ou genérica com A e I).

Os resultados aparecem nas abas sob o desenho (**Reações, Normal N, Cortante Q, Momento M, Deformada**) e na aba **Resultados** do painel lateral. Passando o cursor sobre a estrutura, um balão mostra N, Q, M e os deslocamentos no ponto.

O modelo fica gravado no navegador automaticamente; **Salvar** e **Abrir** trabalham com arquivos `.json`. **Exportar** gera a imagem da vista atual (PNG) e a tabela de esforços e deslocamentos (CSV com `;` e vírgula decimal, pronta para o Excel).

## Arcos por equação

O arco é definido por:

- a equação **y = f(x)** em coordenadas globais (metros);
- **x inicial** e **x final** (x inicial < x final);
- o **número de segmentos** de cálculo (padrão 40, de 4 a 200).

Também há modelos prontos que geram a equação a partir do vão, da flecha e do ponto inicial: **parábola**, **arco circular** (flecha até meio vão) e **catenária**.

Sintaxe aceita na equação: `x`, números com vírgula ou ponto (`2,5` ou `2.5`), `pi`, `e`, os operadores `+ - * / ^` e as funções `sqrt sin cos tan asin acos atan sinh cosh tanh exp ln log abs` (`log` é base 10). A multiplicação precisa do `*`: escreva `2*x`, não `2x`.

Exemplos:

```
4*5*x*(20-x)/20^2          parábola com vão 20 m e flecha 5 m
sqrt(25-x^2)                semicírculo de raio 5 m (x de -5 a 5)
-10*cosh(x/10)              catenária invertida
```

Arco triarticulado: crie o arco, insira um nó no fecho (painel do arco → Inserir nó) e marque a rótula no fim do primeiro trecho. Arco atirantado: ligue as nascenças com uma barra birrotulada e apoie uma delas num apoio de 1º gênero.

### Como o arco é calculado

A curva é dividida em trechos retos de **mesmo comprimento de arco** (o que funciona inclusive com tangente vertical nas nascenças, como no semicírculo), e cada trecho é um elemento de pórtico. Nos diagramas, N e Q são obtidos projetando a resultante de cada seção na **tangente real da curva**, e não na direção do trecho reto, o que evita o serrilhado da poligonal.

## Convenções e unidades

- Eixos globais: X para a direita, Y para cima, rotação anti-horária positiva. Cargas gravitacionais têm sinal negativo.
- Eixo local de cada barra: x do nó inicial para o final; y a 90° no sentido anti-horário. Arcos sempre da esquerda para a direita.
- **N > 0**: tração. **Q > 0**: gira o trecho no sentido horário. **M > 0**: traciona a fibra do lado −y local (a fibra inferior de uma viga desenhada da esquerda para a direita, a face interna de um arco). O diagrama de momento é desenhado **do lado tracionado**.
- Entrada: m, kN, kN/m, kN·m; E em GPa; dimensões de seção em cm (A em cm², I em cm⁴); molas em kN/m e kN·m/rad; recalques em mm e rad. Saída: kN, kN·m, deslocamentos em mm.

## Limitações desta versão

Análise linear elástica de primeira ordem, teoria de Euler–Bernoulli (sem deformação por cortante). Ainda não há: variação de temperatura, linhas de influência, apoios inclinados, casos e combinações de carga, peso próprio automático, seleção múltipla.

## Validação

O núcleo de cálculo é verificado por testes automáticos contra soluções analíticas, entre eles:

- vigas biapoiada, engastada, biengastada, com carga triangular e Gerber; recalque de apoio; apoio elástico;
- treliça e pórtico plano; detecção de estrutura hipostática;
- arco parabólico triarticulado e biarticulado sob carga uniforme por projeção (H = qL²/8f);
- arco semicircular bi e triarticulado com carga concentrada no fecho (H = P/π e H = P/2);
- arco circular sob pressão normal (N = −pR) e catenária sob peso próprio (M ≈ 0);
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

`npm run dev` abre o servidor de desenvolvimento; `npm test` roda os testes do núcleo; `npm run build` gera `docs/index.html`; `npm run smoke` abre o arquivo gerado no Chromium (Playwright) e confere os exemplos, as exportações, o tema escuro e a mensagem de estrutura instável; `npm run build:artifact` gera a versão para página hospedada.

Organização do código:

```
src/expr/      interpretador da equação y = f(x) (sem eval)
src/model/     tipos do modelo, operações, validação, arquivo JSON, equações prontas, exemplos
src/solver/    elemento de pórtico, solver em perfil (skyline) com reordenação, malha, análise e diagramas
src/ui/        interface React + SVG
tests/         testes automáticos (Vitest)
scripts/       teste de ponta a ponta
docs/          aplicação pronta (arquivo único) e plano de desenvolvimento
```
