import { Icon } from './Icon.tsx';

type VolumeControlProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  onToggleMute: () => void;
};

export const VolumeControl = ({ label, value, onChange, onToggleMute }: VolumeControlProps) => {
  const silent = value === 0;
  const action = silent ? 'Unmute' : 'Mute';
  return (
    <div className="volume-control">
      <button type="button" className="icon-button" aria-label={action} title={action} onClick={onToggleMute}>
        <Icon name={silent ? 'mute' : 'volume'} />
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
};
