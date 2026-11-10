import React, { useState } from 'react';
import { inventorySettings, itemCatalog, starterInventory } from './inventory.js';

export default function InventorySettings({ world, onChange, onOpenItems }) {
  const config = inventorySettings(world), catalog = itemCatalog(world);
  const [starterId, setStarterId] = useState(''), [quantity, setQuantity] = useState(1);
  const patch = (value) => onChange({ ...config, ...value });
  const toggle = (key, label) => <label className="check-row"><input type="checkbox" checked={config[key]} onChange={(e) => patch({ [key]: e.target.checked })} /><span>{label}</span></label>;
  let starterError = '', starterBag = null;
  try { starterBag = starterInventory(world); } catch (error) { starterError = error.message; }
  return <div className="tool-group inventory-settings">
    <h3>Inventory <span className="count">whole game</span></h3>
    {toggle('enabled', 'Enable player inventory')}
    <p className="hint">Configure the player bag, hotbar, and Starter Kit. Create item definitions in the Items tab and tools in Equipment.</p>
    <button type="button" className="design-button" onClick={onOpenItems}>Manage items</button>
    {config.enabled && <>
      <div className="inventory-fields">
        <label>Bag slots<input type="number" min={1} max={100} value={config.capacity} onChange={(e) => patch({ capacity: Math.max(1,Math.min(100,Number(e.target.value)||1)) })} /></label>
        <label>First-row / hotbar slots<input type="number" min={1} max={10} value={config.hotbarSize} onChange={(e) => patch({ hotbarSize: Math.max(1,Math.min(10,Number(e.target.value)||1)) })} /></label>
      </div>
      <p className="hint">Equipment always stacks to 1. Reducing bag capacity never deletes existing items.</p>
      {toggle('allowDrop', 'Allow dropping items onto the ground')}
      {toggle('allowDiscard', 'Allow permanently discarding items')}
      <h4>Starter Kit</h4>
      <p className="hint">Choose equipment and items to place in every new player's inventory. Kit order determines the initial bag and first-row shortcuts.</p>
      <form className="login-form" onSubmit={(e) => {
        e.preventDefault();if (!catalog.some((item) => item.id === starterId)) return;
        const existing = config.startingItems.find((entry) => entry.itemId === starterId);
        patch({ startingItems: existing ? config.startingItems.map((entry) => entry.itemId === starterId ? { ...entry, quantity: Math.min(9999,entry.quantity+quantity) } : entry) : [...config.startingItems,{itemId:starterId,quantity}] });
      }}>
        <label>Item<select required value={starterId} onChange={(e) => setStarterId(e.target.value)}><option value="">Choose an item</option>{catalog.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.category})</option>)}</select></label>
        <label>Quantity<input type="number" min={1} max={9999} value={quantity} onChange={(e) => setQuantity(Math.max(1,Math.min(9999,Number(e.target.value)||1)))} /></label>
        <button type="submit" className="design-button" disabled={!starterId}>Add to Starter Kit</button>
      </form>
      <div className="starter-kit-list">{config.startingItems.map((entry,index) => {
        const definition=catalog.find((item)=>item.id===entry.itemId);
        const reorder=(direction)=>{const entries=[...config.startingItems];[entries[index],entries[index+direction]]=[entries[index+direction],entries[index]];patch({startingItems:entries});};
        return <div className="starter-kit-entry" key={`${entry.itemId}-${index}`}>
          {definition?.image&&<img src={definition.image} width={32} height={32} alt=""/>}
          <strong>{definition?.name??'Missing item'}<small>{definition?.category??'Unknown type'}</small></strong>
          <label>Quantity<input type="number" min={1} max={9999} aria-label={`${definition?.name??'Item'} starter quantity`} value={entry.quantity} onChange={(event)=>patch({startingItems:config.startingItems.map((item,i)=>i===index?{...item,quantity:Math.max(1,Math.min(9999,Number(event.target.value)||1))}:item)})}/></label>
          <div className="starter-kit-actions"><button type="button" disabled={index===0} onClick={()=>reorder(-1)} aria-label={`Move ${definition?.name??'item'} earlier`}>Up</button><button type="button" disabled={index===config.startingItems.length-1} onClick={()=>reorder(1)} aria-label={`Move ${definition?.name??'item'} later`}>Down</button><button type="button" onClick={()=>patch({startingItems:config.startingItems.filter((_,i)=>i!==index)})}>Remove from kit</button></div>
        </div>;
      })}</div>
      {!config.startingItems.length&&<p className="hint">The Starter Kit is empty. Choose items above to give new players their first equipment and supplies.</p>}
      {starterBag&&config.startingItems.length>0&&<section className="starter-kit-preview" aria-label="Starting inventory preview"><h4>Player inventory preview</h4><p className="hint">{starterBag.slots.length}/{config.capacity} bag slots used. The first {Math.min(config.hotbarSize,config.capacity)} slots become the hotbar.</p><div className="starter-kit-preview-grid">{starterBag.slots.map((slot)=>{
        const definition=catalog.find((item)=>item.id===slot.itemId);
        return <div key={slot.key} title={`${definition?.name??'Item'}: ${slot.quantity}`} className={slot.position<config.hotbarSize?'quick-slot':''}>{definition?.image&&<img src={definition.image} width={24} height={24} alt={definition.name}/>}<span>{slot.quantity}</span>{slot.position<config.hotbarSize&&<small>{slot.position===9?0:slot.position+1}</small>}</div>;
      })}</div></section>}
      {starterError && <p className="notice" role="alert">{starterError} Increase bag capacity or reduce starting quantities before saving.</p>}
      <p className="hint">Save the world to apply this Starter Kit. It is granted once per player and game, when the player first enters a game with inventory enabled. Changes affect new games; existing bags are preserved. Preview always starts with a temporary test bag.</p>
      <p className="hint">Full bags reject collection without consuming its source. Equip/select, inspect, sort, and first-row hotbar shortcuts are available in Play. Planting and consumable effects come with their gameplay mechanics.</p>
    </>}
  </div>;
}
