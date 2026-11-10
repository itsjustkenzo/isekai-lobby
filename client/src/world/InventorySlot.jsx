import React from 'react';

export default function InventorySlot({ item, quantity = 0, shortcut, active = false, equipped = false, disabled = false, onClick, label, hotbar = false, allowEmptyInteraction = false, draggable = false, onDragStart, onDragEnd, onDragOver, onDrop }) {
  return <button type="button" className={`inventory-slot ${hotbar ? 'hud-item-slot' : 'inventory-bag-slot'}${!item ? ' is-empty' : ''}${active ? ' active' : ''}${equipped ? ' is-equipped' : ''}`} disabled={disabled || (!item && !allowEmptyInteraction)} draggable={draggable && !disabled && Boolean(item)} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragOver={onDragOver} onDrop={onDrop} onClick={onClick} aria-label={label} aria-pressed={active} title={item ? `${item.name}${equipped ? ' (selected)' : ''}` : 'Empty slot'}>
    <span className="slot-well" aria-hidden="true">{item ? item.image ? <img src={item.image} alt="" /> : <span className="slot-fallback">{item.name.slice(0,1).toUpperCase()}</span> : <span className="slot-empty-mark" />}</span>
    {shortcut !== undefined && <small className="slot-key" aria-hidden="true">{shortcut}</small>}
    {quantity > 1 && <b className="slot-quantity" aria-hidden="true">{quantity}</b>}
    {equipped && <span className="slot-equipped-mark" aria-hidden="true" />}
  </button>;
}
