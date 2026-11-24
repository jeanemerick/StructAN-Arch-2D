import { Component, type ReactNode } from 'react';

/**
 * Barreira de erro: uma falha inesperada na interface mostra uma mensagem com a saída
 * (desfazer a última alteração gravada ou recomeçar) em vez de deixar a página em branco.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; onReset(): void }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash" role="alert" data-testid="crash">
        <h2>Algo deu errado na interface</h2>
        <p>O modelo gravado no navegador foi preservado. Recarregue a página para continuar; se o problema voltar, recomece com um modelo novo.</p>
        <p className="help">Detalhe técnico: {this.state.error.message}</p>
        <div className="row">
          <button className="btn primary" onClick={() => location.reload()}>
            Recarregar
          </button>
          <button
            className="btn outline danger"
            onClick={() => {
              this.props.onReset();
              location.reload();
            }}
          >
            Recomeçar com modelo novo
          </button>
        </div>
      </div>
    );
  }
}
