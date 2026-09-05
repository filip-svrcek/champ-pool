export default function ChampionCard({ champ, status, onSetType, disabled }) {
  const isChecked = Boolean(status)

  return (
    <div className={`card ${status || ''} ${disabled ? 'disabled' : ''}`}>
      <div className="card-toggle">
        <input
          type="checkbox"
          checked={isChecked}
          readOnly
          onClick={e => e.preventDefault()}
        />
        <img src={champ.img} alt={champ.name} />
        <div className="name">{champ.name}</div>
      </div>

      <div className="type-slider" role="group" aria-label={`${champ.name} status`}>
        <button
          type="button"
          className={`type-option picked-option ${status === 'picked' ? 'active' : ''}`}
          disabled={disabled}
          onClick={() => onSetType(champ.id, 'picked')}
        >
          Pick
        </button>
        <button
          type="button"
          className={`type-option banned-option ${status === 'banned' ? 'active' : ''}`}
          disabled={disabled}
          onClick={() => onSetType(champ.id, 'banned')}
        >
          Ban
        </button>
      </div>
    </div>
  )
}
