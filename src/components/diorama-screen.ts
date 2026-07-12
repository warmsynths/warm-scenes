import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import './lofi-dashboard';

@customElement('diorama-screen')
export class DioramaScreen extends LitElement {
  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
  `;

  render() {
    return html`<lofi-dashboard></lofi-dashboard>`;
  }
}
