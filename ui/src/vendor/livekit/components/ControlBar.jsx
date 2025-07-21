import React from 'react';
import { 
  DisconnectButton,
  useLocalParticipantPermissions,
  useMaybeLayoutContext
} from '@livekit/components-react';
import { HoldToTalk } from './HoldToTalk';

/**
 * Simplified vendored ControlBar component with camera, microphone, and disconnect buttons
 * This component can be modified to keep camera tracks alive for instant toggling
 */
export function ControlBar({ 
  onDeviceError,
  variation = 'verbose',
  controls = {
    holdToTalk: true,
    leave: true
  },
  className,
  ...props 
}) {
  const layoutContext = useMaybeLayoutContext();
  const permissions = useLocalParticipantPermissions();
  const canPublish = permissions?.canPublish ?? true;

  // Determine what to show based on variation
  const showText = variation === 'verbose' || variation === 'textOnly';

  // Control visibility based on permissions and settings
  const showHoldToTalk = controls.holdToTalk && canPublish;
  const showLeave = controls.leave;

  return (
    <div 
      className={`lk-control-bar ${className || ''}`}
      {...props}
    >
      {showHoldToTalk && (
        <HoldToTalk
          onDeviceError={onDeviceError}
        />
      )}

      {showLeave && (
        <DisconnectButton>
          {showText && 'Leave'}
        </DisconnectButton>
      )}
    </div>
  );
}

