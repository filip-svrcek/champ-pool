export default function LiveSessionModal({
  pendingLiveState,
  sessionName,
  setSessionName,
  onCancel,
  onConfirm,
}) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>{pendingLiveState ? 'Start live session?' : 'Stop live session?'}</h3>
        <p>
          {pendingLiveState
            ? 'Turning on live mode creates a shareable session that updates in real time for anyone using the same link.'
            : 'Turning off live mode stops syncing this session to the shared room. Your checked list will stay local on this device.'}
        </p>

        {pendingLiveState && (
          <label className="modal-field">
            <span>Session name</span>
            <input
              type="text"
              value={sessionName}
              onChange={e => setSessionName(e.target.value)}
              placeholder="Friends draft night"
            />
          </label>
        )}

        <div className="modal-actions">
          <button className="secondary" onClick={onCancel}>Cancel</button>
          <button className="primary" onClick={onConfirm}>
            {pendingLiveState ? 'Start live session' : 'Stop live session'}
          </button>
        </div>
      </div>
    </div>
  )
}
