export default function ChampionCard({ champ, checked, onToggle, disabled }) {
  return (
    <label className={`card ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={() => onToggle(champ.id)}
      />
      <img src={champ.img} alt={champ.name} />
      <div className="name">{champ.name}</div>
    </label>
  )
}
