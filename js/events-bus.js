// KnotPad - Central Event Bus (Singleton EventEmitter)

/**
 * A lightweight event emitter singleton for decoupled module communication.
 * Replaces setExternalFunctions pattern with publish/subscribe pattern.
 */
class EventBus {
    constructor() {
        this._listeners = new Map();
    }

    /**
     * Subscribe to an event
     * @param {string} event - Event name
     * @param {Function} callback - Handler function
     * @returns {Function} Unsubscribe function
     */
    on(event, callback) {
        if (!this._listeners.has(event)) {
            this._listeners.set(event, new Set());
        }
        this._listeners.get(event).add(callback);

        // Return unsubscribe function for convenience
        return () => this.off(event, callback);
    }

    /**
     * Subscribe to an event (only fires once)
     * @param {string} event - Event name
     * @param {Function} callback - Handler function
     * @returns {Function} Unsubscribe function
     */
    once(event, callback) {
        const wrapper = (...args) => {
            this.off(event, wrapper);
            callback(...args);
        };
        return this.on(event, wrapper);
    }

    /**
     * Unsubscribe from an event
     * @param {string} event - Event name
     * @param {Function} callback - Handler function to remove
     */
    off(event, callback) {
        const listeners = this._listeners.get(event);
        if (listeners) {
            listeners.delete(callback);
            if (listeners.size === 0) {
                this._listeners.delete(event);
            }
        }
    }

    /**
     * Emit an event with optional data
     * @param {string} event - Event name
     * @param {...any} args - Arguments to pass to handlers
     * @returns {boolean} True if event had listeners
     */
    emit(event, ...args) {
        const listeners = this._listeners.get(event);
        if (!listeners || listeners.size === 0) {
            return false;
        }

        // Create a copy of listeners to avoid issues if handlers modify the set
        const listenersCopy = [...listeners];
        for (const callback of listenersCopy) {
            try {
                callback(...args);
            } catch (error) {
                console.error(`Error in event handler for "${event}":`, error);
            }
        }
        return true;
    }

    /**
     * Check if an event has listeners
     * @param {string} event - Event name
     * @returns {boolean}
     */
    hasListeners(event) {
        const listeners = this._listeners.get(event);
        return listeners ? listeners.size > 0 : false;
    }

    /**
     * Get the number of listeners for an event
     * @param {string} event - Event name
     * @returns {number}
     */
    listenerCount(event) {
        const listeners = this._listeners.get(event);
        return listeners ? listeners.size : 0;
    }

    /**
     * Remove all listeners for an event or all events
     * @param {string} [event] - Event name (optional, removes all if not provided)
     */
    removeAllListeners(event) {
        if (event) {
            this._listeners.delete(event);
        } else {
            this._listeners.clear();
        }
    }
}

// Singleton instance
const eventBus = new EventBus();

// Event name constants for type safety and discoverability
export const Events = {
    // State management events
    STATE_SAVE: 'state:save',
    STATE_CHANGED: 'state:changed',
    AUTOSAVE_TRIGGER: 'autosave:trigger',

    // Connection events
    CONNECTIONS_UPDATE_ALL: 'connections:updateAll',
    CONNECTIONS_UPDATE: 'connections:update',
    CONNECTIONS_DELETE: 'connections:delete',
    CONNECTIONS_START: 'connections:start',
    CONNECTIONS_COMPLETE: 'connections:complete',
    CONNECTIONS_CANCEL: 'connections:cancel',

    // UI events
    UI_SHOW_CHILD_TYPE_PICKER: 'ui:showChildTypePicker',
    UI_SHOW_CONTEXT_MENU: 'ui:showContextMenu',

    // Item events
    ITEMS_ADD_CHILD_NODE: 'items:addChildNode'
};

export default eventBus;
