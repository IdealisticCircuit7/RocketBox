import React from 'react';
import orbitaSymbol from '../../assets/icons/orbita-welcome.png';
import { FolderTagIconId } from '../../services/deckFilterService';
import { FolderTagIconGlyph } from '../deck/FolderTagIconGlyph';

export interface WelcomeSuggestion {
  readonly label: string;
  readonly icon: FolderTagIconId;
  readonly prompt: string;
}

export const WELCOME_SUGGESTIONS: readonly WelcomeSuggestion[] = [
  {
    label: 'Analisar um asset',
    icon: 'cube',
    prompt: 'Analise tecnicamente os assets selecionados ou listados na biblioteca.',
  },
  {
    label: 'Organizar biblioteca',
    icon: 'layers',
    prompt: 'Separe as texturas em uma coleção própria, sem mover os arquivos originais.',
  },
  {
    label: 'Criar etiquetas',
    icon: 'tag',
    prompt: 'Encontre todos os arquivos FBX sem etiquetas.',
  },
  {
    label: 'Verificar compatibilidade',
    icon: 'shield',
    prompt: 'Quais assets possuem problemas de compatibilidade com Unreal?',
  },
];

export interface NautiaWelcomeScreenProps {
  readonly disabled?: boolean;
  readonly onSelectSuggestion: (prompt: string) => void;
}

/**
 * Tela de Boas-Vindas independente exibida apenas quando a conversa está vazia.
 * Não é armazenada como mensagem comum do histórico.
 */
export const NautiaWelcomeScreen: React.FC<NautiaWelcomeScreenProps> = ({
  disabled = false,
  onSelectSuggestion,
}) => (
  <div className="nautia-welcome-screen" aria-label="Boas-vindas da NautIA">
    <div className="nautia-welcome-emblem-wrap" aria-hidden="true">
      <img
        src={orbitaSymbol}
        alt=""
        className="nautia-welcome-emblem"
      />
    </div>

    <div className="nautia-welcome-copy">
      <h2 className="nautia-welcome-title">Olá! Sou a NautIA.</h2>
      <p className="nautia-welcome-subtitle">
        Sua copilota no RocketBox. Posso ajudar você a analisar, organizar e explorar seus assets.
      </p>
      <p className="nautia-welcome-lead">Por onde começamos?</p>
    </div>

    <div className="nautia-welcome-suggestions" role="group" aria-label="Sugestões iniciais">
      {WELCOME_SUGGESTIONS.map((item) => (
        <button
          key={item.label}
          type="button"
          className="nautia-welcome-pill"
          disabled={disabled}
          onClick={() => onSelectSuggestion(item.prompt)}
        >
          <span className="nautia-welcome-pill__icon" aria-hidden="true">
            <FolderTagIconGlyph icon={item.icon} className="nautia-mini-svg" />
          </span>
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  </div>
);
