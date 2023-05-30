import {mockKalturaBe, loadPlayer, MANIFEST, MANIFEST_SAFARI} from './env';

describe('QnA plugin', () => {
  beforeEach(() => {
    // manifest
    cy.intercept('GET', '**/a.m3u8*', Cypress.browser.name === 'webkit' ? MANIFEST_SAFARI : MANIFEST);
    // thumbnails
    cy.intercept('GET', '**/width/164/vid_slices/100', {fixture: '100.jpeg'});
    cy.intercept('GET', '**/height/360/width/640', {fixture: '640.jpeg'});
    // kava
    cy.intercept('GET', '**/index.php?service=analytics*', {});
  });

  describe('plugin button and panel', () => {
    it('should open then close the QnA side panel', () => {
      mockKalturaBe();
      loadPlayer().then(() => {
        cy.get('[data-testid="qna_pluginButton"]').should('exist');
        cy.get('[data-testid="qna_pluginButton"]').click({force: true});
        cy.get('[data-testid="qna_root"]').should('exist');
        cy.get('[data-testid="qna_root"]').should('have.css', 'visibility', 'visible');
        cy.get('[data-testid="qna_closeButton"]').click({force: true});
        cy.get('[data-testid="qna_root"]').should('have.css', 'visibility', 'hidden');
      });
    });
    it('should open the QnA side panel if expandOnFirstPlay configuration is true', () => {
      mockKalturaBe();
      loadPlayer({expandOnFirstPlay: true}, {autoplay: true}).then(() => {
        cy.get('[data-testid="qna_pluginButton"]').should('exist');
        cy.get('[data-testid="qna_root"]').should('have.css', 'visibility', 'visible');
      });
    });
    it('should close plugin if ESC button pressed', () => {
      mockKalturaBe();
      loadPlayer({expandOnFirstPlay: true}, {autoplay: true}).then(() => {
        cy.get('[data-testid="qna_textArea"]').should('be.visible');
        cy.get('[data-testid="qna_textArea"]').type('{esc}');
        cy.get('[data-testid="qna_root"]').should('have.css', 'visibility', 'hidden');
      });
    });
  });

  describe('qna data', () => {
    it('should display loading spinner', () => {
      mockKalturaBe();
      loadPlayer({expandOnFirstPlay: true}, {autoplay: true}).then(() => {
        cy.get('[data-testid="qna_textArea"]').should('be.visible');
        cy.get('[data-testid="qna_spinner"]').should('be.visible');
      });
    });
  });
});
