export const MECHANIC_EFFECTS=['damage','heal','gather','move','interact','emote','signal'];
export const MECHANIC_ANIMATIONS=['swing','thrust','cast','use','celebrate','dash'];
export function validMechanicBehavior(b){return Boolean(b&&MECHANIC_EFFECTS.includes(b.effect)&&MECHANIC_ANIMATIONS.includes(b.animation)&&Number.isInteger(b.amount)&&b.amount>=1&&b.amount<=20&&Number.isInteger(b.duration)&&b.duration>=100&&b.duration<=3000&&typeof b.resourceName==='string'&&b.resourceName.length<=60);}
