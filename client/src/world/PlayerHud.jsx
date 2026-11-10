import React from 'react';
import StatsHud from './StatsHud.jsx';

// One shared wooden board; the stats canvas draws only its portrait, nameplate and health.
export default function PlayerHud({ spriteUrl, name, health, maxHealth, showStats = true, visible = true, children }) {
  return <div className="player-hud-dock" hidden={!visible} role="group" aria-label="Player HUD">
    {showStats && <StatsHud framed={false} spriteUrl={spriteUrl} name={name} health={health} maxHealth={maxHealth} />}
    {children}
  </div>;
}
