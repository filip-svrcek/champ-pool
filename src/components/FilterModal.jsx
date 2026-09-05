export default function FilterModal({ visibleStatuses, onToggleStatus, onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>Filter champions</h3>
        <p>Choose which champions to show on the board.</p>

        <div className="filter-options">
          <label className="filter-option">
            <input
              type="checkbox"
              checked={visibleStatuses.available}
              onChange={() => onToggleStatus('available')}
            />
            Available
          </label>
          <label className="filter-option">
            <input
              type="checkbox"
              checked={visibleStatuses.picked}
              onChange={() => onToggleStatus('picked')}
            />
            Picked
          </label>
          <label className="filter-option">
            <input
              type="checkbox"
              checked={visibleStatuses.banned}
              onChange={() => onToggleStatus('banned')}
            />
            Banned
          </label>
        </div>

        <div className="modal-actions">
          <button className="primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
