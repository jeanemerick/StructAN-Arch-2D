import type { ReactNode } from 'react';
import { FigAxes, FigBarTypes, FigHinges, FigProjection, FigSigns, FigSupports, FigThermal } from './figures';

/** Seção do manual: título no índice e conteúdo. A busca percorre o texto renderizado. */
export interface HelpSection {
  id: string;
  title: string;
  body: ReactNode;
}

const K = ({ children }: { children: ReactNode }) => <kbd>{children}</kbd>;

export const MANUAL: HelpSection[] = [
  {
    id: 'visao-geral',
    title: '1. Visão geral',
    body: (
      <>
        <p>
          O StructAN-Arch-2D faz a análise linear elástica de estruturas planas formadas por barras e arcos: vigas, pórticos, treliças, arcos e combinações deles. Para cada modelo,
          calcula as reações de apoio, os diagramas de esforço normal (N), esforço cortante (Q) e momento fletor (M) e a configuração deformada.
        </p>
        <p>
          O recurso que distingue o programa é o <b>arco definido por equação</b>: além das formas prontas (parábola, arco circular e catenária, geradas entre dois nós a partir da
          altura do arco), qualquer curva y = f(x) pode ser digitada.
        </p>
        <h4>A tela</h4>
        <ul>
          <li>
            <b>Barra superior</b>: Novo, Abrir, Salvar, Exemplos, Exportar (imagem PNG da vista e tabela CSV), Ajuda, Desfazer e Refazer.
          </li>
          <li>
            <b>Coluna de ferramentas</b> (à esquerda): Selecionar, Nó, Barra, Arco, passo da grade, snap, Duplicar e Enquadrar.
          </li>
          <li>
            <b>Desenho</b> (centro): o modelo e os resultados. A roda do mouse aproxima e afasta; o botão do meio, o botão direito ou a tecla Espaço com o botão esquerdo movem a
            vista.
          </li>
          <li>
            <b>Painel lateral</b>: abas Propriedades (o item selecionado ou o formulário da ferramenta) e Seções.
          </li>
          <li>
            <b>Barra de vistas</b>: Modelo, Reações, Normal N, Cortante Q, Momento M e Deformada, com as opções de escala, valores e reações.
          </li>
          <li>
            <b>Barra de status</b>: posição do cursor (milímetro), situação da análise e a lista de avisos e erros (clique num item para selecionar o elemento).
          </li>
        </ul>
        <p>
          A análise é refeita a cada alteração do modelo. O modelo fica gravado no próprio navegador; para guardar um arquivo, clique em <b>Salvar</b> (formato .json).
        </p>
      </>
    ),
  },
  {
    id: 'primeiro-modelo',
    title: '2. Primeiro modelo, passo a passo',
    body: (
      <>
        <h4>Viga biapoiada</h4>
        <ol>
          <li>Clique em <b>Novo</b>.</li>
          <li>
            Escolha a ferramenta <b>Barra</b> (<K>B</K>). Clique em (0; 0) e depois em (6; 0). Tecle <K>Esc</K> para encerrar a sequência de barras.
          </li>
          <li>
            Escolha <b>Selecionar</b> (<K>V</K>) e clique no nó da esquerda. No painel, em Apoio, escolha <b>2º gênero</b>. No nó da direita, escolha <b>1º gênero (vertical)</b>.
          </li>
          <li>
            Clique na barra e, em Cargas distribuídas, clique em <b>+ Adicionar carga distribuída</b>. O valor padrão é −10 kN/m (vertical, para −Y).
          </li>
          <li>
            Clique em <b>Momento M</b>: o diagrama mostra M máx = qL²/8 = 45 kN·m no meio do vão, com o marcador "máx".
          </li>
        </ol>
        <h4>Pórtico plano</h4>
        <ol>
          <li>
            Com a ferramenta Barra, clique em (0; 0), (0; 4), (6; 4) e (6; 0): cada clique continua a barra a partir do último nó.
          </li>
          <li>Engaste os dois nós da base (apoio Engaste).</li>
          <li>Selecione o nó (0; 4) e informe Fx = 10 kN em Carga no nó.</li>
          <li>Veja M e a Deformada. Nos cantos, o mesmo valor de M dos dois lados aparece num rótulo só.</li>
        </ol>
        <h4>Arco parabólico triarticulado</h4>
        <ol>
          <li>
            Ferramenta <b>Arco</b> (<K>A</K>). Em "Entre dois nós", clique no desenho em (0; 0) e em (6; 0), ou digite as coordenadas. Informe a <b>altura do arco</b> f = 1,5 m e a
            forma <b>Parábola</b>; tecle <K>Enter</K>.
          </li>
          <li>
            Selecione o arco e, em Inserir nó, digite x = 3 e tecle <K>Enter</K>: o fecho passa a ser um nó.
          </li>
          <li>Selecione o nó do fecho e marque <b>Rótula no nó</b>. Apoie as duas nascenças em 2º gênero.</li>
          <li>
            Nos dois trechos, adicione carga vertical de −10 kN/m <b>por projeção</b>. Resultado esperado: H = qL²/(8f) = 30 kN e M ≈ 0. O exemplo "Arco triarticulado com carga em
            faixa" traz este modelo pronto.
          </li>
        </ol>
      </>
    ),
  },
  {
    id: 'ferramentas',
    title: '3. Ferramentas, atalhos, grade e coordenadas',
    body: (
      <>
        <h4>Ferramentas</h4>
        <ul>
          <li>
            <b>Selecionar</b> (<K>V</K>): clique num nó ou barra para editar. <K>Shift</K>+clique soma ou retira itens da seleção. Arrastar no fundo desenha a janela de seleção:
            da esquerda para a direita pega só o que estiver inteiro dentro; da direita para a esquerda (traço tracejado), pega o que a janela tocar.
          </li>
          <li>
            <b>Nó</b> (<K>N</K>): ao clicar no botão, escolha <b>Clicar no desenho</b> ou <b>Informar coordenadas</b>. No segundo modo, digite X e Y e tecle <K>Enter</K>: o nó é
            criado e o cursor volta ao campo X para o próximo. Um marcador mostra a posição antes de criar.
          </li>
          <li>
            <b>Barra</b> (<K>B</K>): clique no ponto inicial e no final; a barra seguinte começa no último nó. <K>Esc</K> ou o botão direito encerram.
          </li>
          <li>
            <b>Arco</b> (<K>A</K>): formulário do arco, com os nós das nascenças, forma e altura do arco (ou a equação livre).
          </li>
          <li>
            <b>Duplicar</b> (<K>Ctrl</K>+<K>D</K>): copia a seleção com apoios, cargas, rótulas, tipos, seções e temperatura. O deslocamento sugerido deixa folga para os diagramas
            das duas estruturas não se sobreporem e pode ser editado antes de confirmar com <K>Enter</K>. A cópia fica selecionada e <K>Ctrl</K>+<K>Z</K> a remove num passo só. Com
            um deslocamento igual ao vão, a cópia se liga ao original nos nós que coincidem: é um jeito rápido de montar uma viga contínua.
          </li>
          <li>
            <b>Enquadrar</b> (<K>F</K>): ajusta a vista ao modelo inteiro.
          </li>
        </ul>
        <h4>Atalhos</h4>
        <table className="help-table">
          <tbody>
            <tr>
              <td>
                <K>V</K> <K>N</K> <K>B</K> <K>A</K>
              </td>
              <td>Selecionar, Nó, Barra, Arco</td>
            </tr>
            <tr>
              <td>
                <K>F</K>
              </td>
              <td>Enquadrar o modelo</td>
            </tr>
            <tr>
              <td>
                <K>Del</K>
              </td>
              <td>Excluir os itens selecionados</td>
            </tr>
            <tr>
              <td>
                <K>Ctrl</K>+<K>A</K> / <K>Ctrl</K>+<K>D</K>
              </td>
              <td>Selecionar tudo / Duplicar</td>
            </tr>
            <tr>
              <td>
                <K>Ctrl</K>+<K>Z</K> / <K>Ctrl</K>+<K>Y</K>
              </td>
              <td>Desfazer / Refazer</td>
            </tr>
            <tr>
              <td>
                <K>Enter</K>
              </td>
              <td>Dentro de um formulário, confirma o campo e aplica (criar nó, criar arco, aplicar ao arco, inserir nó, duplicar)</td>
            </tr>
            <tr>
              <td>
                <K>Esc</K>
              </td>
              <td>Na ordem: cancela a barra em construção; fecha menu, formulário ou esta Ajuda; sai da vista de resultado; limpa a seleção</td>
            </tr>
          </tbody>
        </table>
        <p>Os atalhos de uma letra não valem enquanto o cursor está num campo de texto.</p>
        <h4>Grade e coordenadas</h4>
        <ul>
          <li>
            O <b>passo da grade</b> aceita qualquer valor positivo (0,01; 0,1; 1; 2,5…). Com o <b>snap</b> ligado, o clique vai para o ponto da grade mais próximo; nós existentes
            atraem o clique antes da grade.
          </li>
          <li>Com o snap desligado, a coordenada do clique é arredondada ao milímetro. Coordenadas digitadas ficam exatamente como foram digitadas.</li>
          <li>Os campos numéricos aceitam vírgula ou ponto decimal; o valor vale ao sair do campo ou com Enter.</li>
          <li>
            Um nó que cai sobre uma barra ou um arco (por clique, por coordenadas ou ao ser movido) passa a ficar <b>ligado</b> a ele: o elemento é dividido nesse ponto. Um nó que
            cai sobre outro nó se funde com ele (as cargas são somadas). A tolerância é de 1 mm.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'apoios-barras',
    title: '4. Apoios, molas, recalques, rótulas e tipos de barra',
    body: (
      <>
        <FigSupports />
        <h4>Apoios</h4>
        <p>
          No painel do nó, os botões prontos (Livre, 1º gênero vertical ou horizontal, 2º gênero, Engaste) marcam as direções restringidas. Cada direção (X, Y e rotação) também pode
          ser marcada à parte.
        </p>
        <ul>
          <li>
            <b>Direção marcada</b>: restringida. O campo ao lado é o <b>recalque</b> imposto (mm, ou rad na rotação). Um recalque de −10 mm em Y desloca o apoio 1 cm no sentido −Y.
          </li>
          <li>
            <b>Direção desmarcada</b>: livre ou com <b>mola</b>. O campo é a rigidez (kN/m ou kN·m/rad); zero deixa a direção livre. Rigidez negativa é erro.
          </li>
        </ul>
        <h4>Rótulas</h4>
        <FigHinges />
        <p>A rótula libera a rotação relativa entre a barra e o nó. Há duas maneiras de atribuí-la, com desenhos diferentes:</p>
        <ul>
          <li>
            <b>Pelo nó</b> (painel do nó, <b>Rótula no nó</b>): todas as barras e arcos que chegam ao nó ficam rotulados nele. O desenho é uma bolinha vazia única, centrada no nó
            — é o caso do fecho de um arco triarticulado. Com vários nós selecionados, os botões <b>Rotular os nós</b> e <b>Tirar a rótula dos nós</b> valem para todos.
          </li>
          <li>
            <b>Pela extremidade da barra</b> (painel da barra, rótula no início ou no fim): só aquela barra fica rotulada; as demais continuam ligadas rigidamente ao nó. O desenho
            é uma bolinha vazia na ponta da própria barra, afastada do nó — é o caso de um tirante preso a um pilar contínuo: o pilar segue inteiro e cada tirante tem a sua rótula.
          </li>
        </ul>
        <p>
          O nó sem rótula é desenhado como uma bolinha cheia. Numa barra que chega a um nó rotulado, a rótula da extremidade aparece marcada "(do nó)" e não se repete no desenho.
          Quando todas as barras chegam rotuladas a um nó, o programa trava a rotação desse nó (que não teria rigidez nenhuma) e avisa se houver momento aplicado ali.
        </p>
        <h4>Tipos de barra</h4>
        <FigBarTypes />
        <ul>
          <li>
            <b>Pórtico</b> (padrão): resiste a esforço normal e a flexão (EA e EI).
          </li>
          <li>
            <b>Somente axial</b> (tirante ou escora): só EA. É sempre birrotulada e não transmite momento às demais barras; Q e M são nulos nela. Carga distribuída transversal não é
            aceita: aplique a carga nos nós ou mude o tipo. É equivalente a uma barra de pórtico com as duas rótulas.
          </li>
          <li>
            <b>Somente flexão</b> (inextensível): só EI; a deformação axial é desprezada. O programa adota uma rigidez axial de penalidade que deixa a flexibilidade axial da barra
            (ou do arco inteiro) 10⁶ vezes menor que a de flexão: a variação de comprimento fica desprezível e o esforço normal sai do equilíbrio. Se a barra for impedida de se
            alongar com a temperatura, o programa avisa, pois nesse caso o esforço normal de uma barra inextensível não tem sentido físico.
          </li>
        </ul>
        <p>Arcos aceitam Pórtico e Somente flexão. A deformação por cortante é desprezada em todos os tipos (teoria de Euler–Bernoulli).</p>
      </>
    ),
  },
  {
    id: 'cargas',
    title: '5. Cargas: tipos, sinais, comprimento e projeção, temperatura',
    body: (
      <>
        <h4>Carga nodal</h4>
        <p>Fx e Fy em kN, Mz em kN·m. Sinais pelos eixos globais: Fy negativo segue a gravidade; Mz positivo é anti-horário.</p>
        <h4>Carga distribuída</h4>
        <p>No painel da barra ou do arco, cada carga tem direção, valor no início e no fim (variação linear; nos arcos, linear em x) e, nas direções globais, a referência:</p>
        <ul>
          <li>
            <b>Vertical (Y global)</b> e <b>Horizontal (X global)</b>: valores negativos apontam para −Y ou −X.
          </li>
          <li>
            <b>Normal ao eixo (y local)</b> e <b>Tangente ao eixo (x local)</b>: acompanham o eixo da barra. Num arco, y local negativo é pressão para dentro da curva.
          </li>
        </ul>
        <FigProjection />
        <p>
          <b>Por comprimento</b>: q por metro de barra (peso próprio, por exemplo). <b>Por projeção</b>: q por metro de projeção horizontal (para carga vertical) ou vertical (para
          carga horizontal), como a carga de uma cobertura sobre um arco. Numa barra inclinada de ângulo α, q por comprimento equivale a q/cos α por projeção.
        </p>
        <h4>Desenho das cargas</h4>
        <p>
          As cargas em direção global aparecem numa <b>faixa reta</b>: a vertical numa faixa horizontal acima do elemento, cobrindo a projeção dele; a horizontal numa faixa vertical
          ao lado. A altura das setas é a intensidade por metro de projeção (a carga por comprimento é convertida, para o desenho não enganar). Trechos vizinhos com a mesma carga
          formam uma faixa só. Cargas locais e cargas sem projeção (carga vertical numa barra vertical) ficam sobre o elemento. A opção <b>Cargas sobre o eixo</b>, na barra de
          vistas, volta ao desenho antigo.
        </p>
        <h4>Temperatura</h4>
        <FigThermal />
        <p>
          No painel da barra, informe a variação de temperatura (°C, em relação à temperatura de referência) da <b>face externa</b> (lado +y local: o topo da barra desenhada da
          esquerda para a direita; o extradorso do arco) e da <b>face interna</b> (lado −y). A parte uniforme é a média das duas e alonga a barra; o gradiente (interna − externa)/h
          curva a barra. O coeficiente α está na seção (padrão 1,0×10⁻⁵/°C) e a altura h vem da forma da seção; nas seções genérica e de rigidez direta, informe h quando houver
          gradiente.
        </p>
        <p>
          Exemplos de conferência: viga biapoiada com a face interna 20 °C mais quente que a externa não tem esforços e desce κL²/8 no meio (κ = α·20/h); a mesma viga biengastada
          fica com M = −EIκ constante e flecha nula; biengastada com aquecimento uniforme ΔT fica com N = −EAαΔT.
        </p>
      </>
    ),
  },
  {
    id: 'secoes',
    title: '6. Seções e materiais',
    body: (
      <>
        <p>Na aba Seções, cada seção tem nome, tipo, módulo de elasticidade E (GPa), coeficiente de dilatação α e as dimensões:</p>
        <ul>
          <li>
            <b>Retangular</b>: base b e altura h (cm).
          </li>
          <li>
            <b>Circular</b>: diâmetro d (cm).
          </li>
          <li>
            <b>Genérica</b>: área A (cm²) e inércia I (cm⁴); altura h opcional, para o gradiente de temperatura.
          </li>
          <li>
            <b>Rigidez direta</b>: EA (kN) e EI (kN·m²) digitados; o E não entra no cálculo. A barra somente axial só precisa de EA e a somente flexão só de EI (a outra pode ficar
            zero).
          </li>
        </ul>
        <p>
          Valores típicos: concreto E ≈ 25 a 35 GPa, α = 1,0×10⁻⁵/°C; aço E = 200 a 210 GPa, α = 1,2×10⁻⁵/°C; madeira E ≈ 10 a 20 GPa (na direção das fibras).
        </p>
        <p>Uma seção atribuída a barras não pode ser apagada; o modelo precisa de pelo menos uma seção.</p>
      </>
    ),
  },
  {
    id: 'resultados',
    title: '7. Leitura dos resultados e convenções de sinal',
    body: (
      <>
        <FigAxes />
        <ul>
          <li>Eixos globais: X para a direita, Y para cima, rotação anti-horária positiva.</li>
          <li>Eixo local de cada barra: x do nó inicial para o final; y a 90° no sentido anti-horário. Arcos sempre da esquerda para a direita.</li>
        </ul>
        <FigSigns />
        <ul>
          <li>
            <b>N &gt; 0</b>: tração.
          </li>
          <li>
            <b>Q &gt; 0</b>: gira o trecho no sentido horário.
          </li>
          <li>
            <b>M &gt; 0</b>: traciona a fibra do lado −y local (a fibra inferior de uma viga desenhada da esquerda para a direita; a face interna de um arco). O diagrama de M é
            desenhado do lado tracionado.
          </li>
        </ul>
        <h4>Vistas</h4>
        <ul>
          <li>
            <b>Reações</b>: setas e valores nos apoios. As reações também aparecem nas vistas N, Q e M (caixa <b>Reações</b>).
          </li>
          <li>
            <b>Normal, Cortante e Momento</b>: azul é positivo e vermelho, negativo. O maior valor positivo e o maior negativo da estrutura têm marcador e etiqueta "máx" e "mín"; os
            extremos de cada barra aparecem com menos destaque. Nas barras, o extremo é exato (M onde Q = 0, por exemplo).
          </li>
          <li>
            Onde o esforço salta num nó (força concentrada, apoio, mudança de direção), cada valor aparece do lado da sua barra, afastado do nó e ligado ao diagrama por um traço de
            chamada; valores iguais dos dois lados viram um rótulo só. Num nó que só divide um elemento, o diagrama segue contínuo, sem emenda.
          </li>
          <li>
            <b>Deformada</b>: ampliada para ficar visível; o fator aparece no canto. O deslocamento máximo é indicado em mm.
          </li>
          <li>
            Passando o cursor sobre a estrutura numa vista de resultado, um balão mostra N, Q, M e os deslocamentos do ponto.
          </li>
          <li>
            <b>Escala</b> amplia ou reduz o desenho dos diagramas; <b>Valores</b> liga e desliga os rótulos. <K>Esc</K> volta ao modelo.
          </li>
        </ul>
        <h4>Arcos</h4>
        <p>
          O arco é dividido em trechos retos de mesmo comprimento de arco (padrão 40, de 4 a 200). Nos diagramas, N e Q são projetados na tangente real da curva, e não na do
          trecho reto, o que evita o serrilhado. Os extremos do arco são lidos nos nós dessa divisão.
        </p>
        <h4>Exportar</h4>
        <p>
          <b>Imagem da vista atual (PNG)</b>, sempre em fundo claro, e <b>Esforços e deslocamentos (CSV)</b>, com ponto e vírgula e vírgula decimal, pronta para planilhas.
        </p>
      </>
    ),
  },
  {
    id: 'boas-praticas',
    title: '8. Boas práticas de modelagem',
    body: (
      <>
        <h4>Estabilidade e mecanismos</h4>
        <ul>
          <li>
            Uma estrutura plana precisa impedir dois deslocamentos e um giro de corpo rígido. Uma viga com dois apoios de 1º gênero verticais é instável na horizontal: troque um deles
            por 2º gênero.
          </li>
          <li>Três rótulas alinhadas formam mecanismo. Num pórtico, rótulas em excesso (nas duas pontas de todas as barras de um nó e nos apoios) também.</li>
          <li>
            A mensagem de estrutura instável indica onde o cálculo encontrou o deslocamento livre; a causa pode estar perto (um apoio que falta, uma rótula a mais). Teste retirando
            rótulas ou acrescentando apoios até a análise concluir.
          </li>
        </ul>
        <h4>Onde pôr rótulas</h4>
        <ul>
          <li>Treliça: prefira o tipo Somente axial; as barras já ficam birrotuladas.</li>
          <li>Arco triarticulado: insira o nó do fecho e marque Rótula no nó.</li>
          <li>Viga Gerber: Rótula no nó da articulação (com só duas barras, a rótula na ponta de uma delas dá o mesmo resultado).</li>
          <li>Barra presa a uma peça que continua inteira (tirante num pilar, escora numa viga): rótula na extremidade da barra, não no nó.</li>
        </ul>
        <h4>Número de segmentos do arco</h4>
        <p>
          O padrão de 40 trechos dá erro bem menor que 1% nos casos correntes. Com tangente quase vertical (semicírculo) ou cargas concentradas próximas,
          aumente para 80 ou mais e confira se o resultado muda.
        </p>
        <h4>Unidades</h4>
        <p>
          Comprimentos em m, forças em kN, momentos em kN·m, E em GPa, dimensões de seção em cm, recalques em mm, temperaturas em °C. Os resultados saem em kN, kN·m e mm.
        </p>
        <h4>Conferência do equilíbrio</h4>
        <p>
          Some as reações e compare com o total das cargas (ΣFx = 0 e ΣFy = 0). Em vigas, confira M máx com uma fórmula conhecida (qL²/8) e, em arcos parabólicos com carga
          uniforme por projeção, o empuxo H = qL²/(8f).
        </p>
        <h4>Erros comuns</h4>
        <ul>
          <li>Sinal da carga: gravidade é negativa em Y.</li>
          <li>Carga por comprimento onde a intenção era por projeção (ou o contrário) num arco ou numa barra inclinada.</li>
          <li>Nó solto: carga ou apoio num nó que não está ligado a nenhuma barra é erro e impede a análise.</li>
          <li>Seção com E em kN/m² digitado como GPa (o campo já está em GPa).</li>
          <li>Gradiente de temperatura em seção genérica sem a altura h.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'mensagens',
    title: '9. Mensagens do programa e como resolver',
    body: (
      <>
        <table className="help-table">
          <thead>
            <tr>
              <th>Mensagem</th>
              <th>O que fazer</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Estrutura instável (hipostática): deslocamento livre no nó…</td>
              <td>Acrescente apoios ou retire rótulas (seção 8).</td>
            </tr>
            <tr>
              <td>A estrutura não tem apoios</td>
              <td>Defina ao menos os apoios que impedem o movimento de corpo rígido.</td>
            </tr>
            <tr>
              <td>O nó … tem carga (ou apoio) mas não está ligado a nenhuma barra</td>
              <td>Mova o nó para cima de uma barra ou arco (ele se liga sozinho) ou remova a carga.</td>
            </tr>
            <tr>
              <td>O nó … está sobre a barra (ou o arco) … mas não está ligado a ela</td>
              <td>Selecione o nó e clique em "Ligar ao elemento".</td>
            </tr>
            <tr>
              <td>A seção … precisa de E, área e inércia positivos (ou EA, EI)</td>
              <td>Confira a seção; o tipo de barra diz quais rigidezes são exigidas.</td>
            </tr>
            <tr>
              <td>A barra … é somente axial e não aceita carga transversal distribuída</td>
              <td>Aplique a carga nos nós ou mude o tipo da barra para Pórtico.</td>
            </tr>
            <tr>
              <td>A barra … tem gradiente de temperatura: informe a altura h da seção</td>
              <td>Na aba Seções, preencha "Altura h (gradiente)".</td>
            </tr>
            <tr>
              <td>Equação inválida / A equação não é definida em x = …</td>
              <td>Confira a sintaxe (multiplicação sempre com *) e o domínio (raiz de número negativo, divisão por zero).</td>
            </tr>
            <tr>
              <td>A equação tem um salto (descontinuidade) perto de x = …</td>
              <td>O arco precisa ser uma curva contínua no intervalo; divida em dois arcos ou corrija a equação.</td>
            </tr>
            <tr>
              <td>Com essa altura do arco e esses níveis o arco circular passaria da vertical</td>
              <td>Diminua a altura do arco ou escolha a parábola.</td>
            </tr>
            <tr>
              <td>O recalque do nó … é ignorado: essa direção não está restringida</td>
              <td>Marque a direção (o recalque só vale em direção restringida).</td>
            </tr>
            <tr>
              <td>O momento aplicado no nó … é ignorado: todas as barras chegam rotuladas nele</td>
              <td>Tire a rótula do nó (ou a de uma das barras) ou aplique o momento em outro ponto.</td>
            </tr>
          </tbody>
        </table>
      </>
    ),
  },
  {
    id: 'equacoes',
    title: '10. Arcos por equação y = f(x)',
    body: (
      <>
        <p>
          Na ferramenta Arco, escolha <b>Equação livre (avançado)</b>. Digite y = f(x) em coordenadas globais (metros), o x inicial e o x final. Um arco criado entre dois nós também
          pode ter a equação editada pelo botão "Editar a equação"; ele passa então a ser de equação livre e deixa de se refazer quando uma nascença se move.
        </p>
        <p>
          Sintaxe: <code>x</code>, números com vírgula ou ponto, <code>pi</code>, <code>e</code>, os operadores <code>+ - * / ^</code> e as funções{' '}
          <code>sqrt sin cos tan asin acos atan sinh cosh tanh exp ln log abs</code> (<code>log</code> é base 10). Escreva <code>2*x</code>, e não <code>2x</code>.
        </p>
        <ul>
          <li>
            <code>4*5*x*(20-x)/20^2</code>: parábola com vão de 20 m e altura do arco de 5 m.
          </li>
          <li>
            <code>sqrt(25-x^2)</code>: semicírculo de raio 5 m (x de −5 a 5).
          </li>
          <li>
            <code>-10*cosh(x/10)</code>: catenária invertida.
          </li>
        </ul>
        <p>
          No modo entre dois nós, a parábola aceita nascenças em níveis diferentes (a altura é medida da corda, no meio do vão); o arco circular e a catenária também, desde que a
          curva continue sendo uma função de x.
        </p>
      </>
    ),
  },
  {
    id: 'limitacoes',
    title: '11. Limitações',
    body: (
      <ul>
        <li>Análise linear elástica de primeira ordem; sem efeitos de segunda ordem, flambagem ou não linearidade de material.</li>
        <li>Euler–Bernoulli: a deformação por cortante é desprezada.</li>
        <li>Sem casos e combinações de carga, linhas de influência, apoios inclinados ou peso próprio automático.</li>
        <li>Seção constante em cada barra e em cada arco.</li>
        <li>Arco descrito como y = f(x): não há arco com trechos verticais no interior nem curvas fechadas.</li>
      </ul>
    ),
  },
  {
    id: 'exemplos',
    title: '12. Exemplos resolvidos',
    body: (
      <>
        <p>
          Parábola y = x(6 − x)/6: vão L = 6 m, altura do arco f = 1,5 m, tangente tan α = 1 − x/3. Os valores a seguir conferem com o programa (40 segmentos por metade).
        </p>
        <h4>Arco biapoiado (2º gênero em A, 1º gênero em B), P = 100 kN no fecho</h4>
        <p>R_A = R_B = 50 kN e H = 0. Para x ≤ 3: M = 50x; N = −50 sen α; Q = +50 cos α.</p>
        <table className="help-table">
          <thead>
            <tr>
              <th>x (m)</th>
              <th>N (kN)</th>
              <th>Q (kN)</th>
              <th>M (kN·m)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>0</td>
              <td>−35,36</td>
              <td>+35,36</td>
              <td>0</td>
            </tr>
            <tr>
              <td>1,5</td>
              <td>−22,36</td>
              <td>+44,72</td>
              <td>75</td>
            </tr>
            <tr>
              <td>3 (esquerda / direita)</td>
              <td>0</td>
              <td>+50 / −50</td>
              <td>150</td>
            </tr>
          </tbody>
        </table>
        <p>
          O nó do fecho precisa estar <b>ligado</b> ao arco (Inserir nó, ferramenta Nó sobre o arco ou um nó levado até lá): só assim a força chega à estrutura.
        </p>
        <h4>Arco triarticulado, P = 100 kN no fecho</h4>
        <p>H = PL/(4f) = 100 kN; R_A = R_B = 50 kN. Em x = 1,5: N = −111,80 kN, Q = 0 e M = −37,5 kN·m (mínimo).</p>
        <h4>Arco triarticulado com q = 10 kN/m por projeção (exemplo pronto)</h4>
        <p>H = qL²/(8f) = 30 kN; R_A = R_B = 30 kN; M ≈ 0 em todo o arco; N = −30 kN no fecho e −42,43 kN nas nascenças.</p>
        <h4>Pórtico de duas águas com tirantes (exemplo pronto)</h4>
        <p>
          Três pilares engastados de 4 m, águas somente flexão, dois tirantes somente axiais, 10 kN/m na água esquerda (por projeção), 5 kN/m no pilar direito e recalque de 1 cm no
          apoio esquerdo. Na vista Reações, a soma das reações verticais dá 40 kN (10 × 4) e a das horizontais, 20 kN (5 × 4): o recalque só acrescenta reações
          autoequilibradas.
        </p>
      </>
    ),
  },
];
