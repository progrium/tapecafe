import React from 'react';

/**
 * VENDOR NOTES: Utility functions vendored from @livekit/components-react
 * to support vendored components.
 */

/**
 * Clone a single child element with additional props
 * @internal
 */
export function cloneSingleChild(children, props, key) {
  return React.Children.map(children, (child) => {
    // Checking isValidElement is the safe way and avoids a typescript
    // error too.
    if (React.isValidElement(child) && React.Children.only(children)) {
      if (child.props.className) {
        // make sure we retain classnames of both passed props and child
        props ??= {};
        // Simple className merge (we don't have clsx dependency)
        props.className = `${child.props.className || ''} ${props.className || ''}`.trim();
        props.style = { ...child.props.style, ...props.style };
      }
      return React.cloneElement(child, { ...props, key });
    }
    return child;
  });
}