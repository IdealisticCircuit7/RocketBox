import React from 'react';

export type CustomIconName = 'rocket' | 'library' | 'settings';

export interface CustomIconProps {
  readonly name: CustomIconName;
  readonly size?: number;
  readonly className?: string;
  readonly title?: string;
}

/**
 * Componente centralizado para renderização monocromática dos ícones
 * personalizados do OCSIS RocketBox via máscara CSS (`currentColor`).
 */
export const CustomIcon: React.FC<CustomIconProps> = ({
  name,
  size,
  className = '',
  title,
}) => (
  <span
    className={`ocsis-icon ocsis-custom-icon ocsis-custom-icon--${name} ${className}`.trim()}
    style={size ? { width: size, height: size } : undefined}
    data-custom-icon={name}
    role={title ? 'img' : undefined}
    aria-label={title}
    aria-hidden={title ? undefined : true}
  />
);
