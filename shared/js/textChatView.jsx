/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var loop = loop || {};
loop.shared = loop.shared || {};
loop.shared.views = loop.shared.views || {};
loop.shared.views.chat = (function(mozL10n) {
  "use strict";

  var sharedActions = loop.shared.actions;
  var sharedMixins = loop.shared.mixins;
  var sharedViews = loop.shared.views;
  var CHAT_MESSAGE_TYPES = loop.store.CHAT_MESSAGE_TYPES;
  var CHAT_CONTENT_TYPES = loop.shared.utils.CHAT_CONTENT_TYPES;

  /**
   * Renders an individual entry for the text chat entries view.
   */
  var TextChatEntry = React.createClass({
    mixins: [React.addons.PureRenderMixin],

    propTypes: {
      contentType: React.PropTypes.string.isRequired,
      dispatcher: React.PropTypes.instanceOf(loop.Dispatcher),
      extraData: React.PropTypes.object,
      message: React.PropTypes.string.isRequired,
      showTimestamp: React.PropTypes.bool.isRequired,
      timestamp: React.PropTypes.string.isRequired,
      type: React.PropTypes.string.isRequired,
      useDesktopPaths: React.PropTypes.bool
    },

    /**
     * Pretty print timestamp. From time in milliseconds to HH:MM
     * (or L10N equivalent).
     *
     */
    _renderTimestamp: function() {
      var date = new Date(this.props.timestamp);
      var language = mozL10n.language ? mozL10n.language.code
                                      : mozL10n.getLanguage();

      return (
        <span className="text-chat-entry-timestamp">
          {date.toLocaleTimeString(language,
                                   { hour: "numeric", minute: "numeric",
                                   hour12: false })}
        </span>
      );
    },

    render: function() {
      var classes = classNames({
        "text-chat-entry": true,
        "received": this.props.type === CHAT_MESSAGE_TYPES.RECEIVED,
        "sent": this.props.type === CHAT_MESSAGE_TYPES.SENT,
        "special": this.props.type === CHAT_MESSAGE_TYPES.SPECIAL,
        "room-name": this.props.contentType === CHAT_CONTENT_TYPES.ROOM_NAME
      });

      var optionalProps = {};
      if (loop.shared.utils.isDesktop()) {
        optionalProps.linkClickHandler = function(url) {
          loop.request("OpenURL", url);
        };
      }

      if (this.props.contentType === CHAT_CONTENT_TYPES.CONTEXT_TILE) {
        return (
          <div className={classes}>
            <sharedViews.ContextUrlView
              allowClick={true}
              description={this.props.message}
              dispatcher={this.props.dispatcher}
              thumbnail={this.props.extraData.newRoomThumbnail}
              url={this.props.extraData.newRoomURL}
              useDesktopPaths={this.props.useDesktopPaths} />
            {this.props.showTimestamp ? this._renderTimestamp() : null}
          </div>
        );
      }

      return (
        <div className={classes}>
          <sharedViews.LinkifiedTextView {...optionalProps}
            rawText={this.props.message} />
          <span className="text-chat-arrow" />
          {this.props.showTimestamp ? this._renderTimestamp() : null}
        </div>
      );
    }
  });

  var TextChatRoomName = React.createClass({
    mixins: [React.addons.PureRenderMixin],

    propTypes: {
      message: React.PropTypes.string.isRequired
    },

    render: function() {
      return (
        <div className="text-chat-header special room-name">
          <p>{mozL10n.get("rooms_welcome_title", { conversationName: this.props.message })}</p>
        </div>
      );
    }
  });

  /**
   * Manages the text entries in the chat entries view. This is split out from
   * TextChatView so that scrolling can be managed more efficiently - this
   * component only updates when the message list is changed.
   */
  var TextChatEntriesView = React.createClass({
    mixins: [
      React.addons.PureRenderMixin,
      sharedMixins.AudioMixin
    ],

    statics: {
      ONE_MINUTE: 60
    },

    propTypes: {
      dispatcher: React.PropTypes.instanceOf(loop.Dispatcher).isRequired,
      messageList: React.PropTypes.arrayOf(React.PropTypes.object).isRequired,
      showInitialContext: React.PropTypes.bool.isRequired,
      useDesktopPaths: React.PropTypes.bool.isRequired
    },

    getInitialState: function() {
      return {
        receivedMessageCount: 0
      };
    },

    _hasChatMessages: function() {
      return this.props.messageList.some(function(message) {
        return message.contentType === CHAT_CONTENT_TYPES.TEXT;
      });
    },

    componentWillUpdate: function() {
      var node = this.getDOMNode();
      if (!node) {
        return;
      }
      // Scroll only if we're right at the bottom of the display, or if we've
      // not had any chat messages so far.
      this.shouldScroll = !this._hasChatMessages() ||
        node.scrollHeight === node.scrollTop + node.clientHeight;
    },

    componentWillReceiveProps: function(nextProps) {
      var receivedMessageCount = nextProps.messageList.filter(function(message) {
        return message.type === CHAT_MESSAGE_TYPES.RECEIVED;
      }).length;

      // If the number of received messages has increased, we play a sound.
      if (receivedMessageCount > this.state.receivedMessageCount) {
        this.play("message");
        this.setState({ receivedMessageCount: receivedMessageCount });
      }
    },

    componentDidUpdate: function() {
      // Don't scroll if we haven't got any chat messages yet - e.g. for context
      // display, we want to display starting at the top.
      if (this.shouldScroll && this._hasChatMessages()) {
        // This ensures the paint is complete.
        window.requestAnimationFrame(function() {
          try {
            var node = this.getDOMNode();
            node.scrollTop = node.scrollHeight - node.clientHeight;
          } catch (ex) {
            console.error("TextChatEntriesView.componentDidUpdate exception", ex);
          }
        }.bind(this));
      }
    },

    render: function() {
      /* Keep track of the last printed timestamp. */
      var lastTimestamp = 0;

      var entriesClasses = classNames({
        "text-chat-entries": true
      });

      return (
        <div className={entriesClasses}>
          <div className="text-chat-scroller">
            {
              this.props.messageList.map(function(entry, i) {
                if (entry.type === CHAT_MESSAGE_TYPES.SPECIAL) {
                  if (!this.props.showInitialContext) { return null; }
                  switch (entry.contentType) {
                    case CHAT_CONTENT_TYPES.ROOM_NAME:
                      return (
                        <TextChatRoomName
                          key={i}
                          message={entry.message} />
                      );
                    case CHAT_CONTENT_TYPES.CONTEXT:
                      return (
                        <div className="context-url-view-wrapper" key={i}>
                          <sharedViews.ContextUrlView
                            allowClick={true}
                            description={entry.message}
                            dispatcher={this.props.dispatcher}
                            thumbnail={entry.extraData.thumbnail}
                            url={entry.extraData.location}
                            useDesktopPaths={this.props.useDesktopPaths} />
                        </div>
                      );
                    default:
                      console.error("Unsupported contentType",
                                    entry.contentType);
                      return null;
                  }
                }

                /* For SENT messages there is no received timestamp. */
                var timestamp = entry.receivedTimestamp || entry.sentTimestamp;

                var timeDiff = this._isOneMinDelta(timestamp, lastTimestamp);
                var shouldShowTimestamp = this._shouldShowTimestamp(i,
                                                                    timeDiff);

                if (shouldShowTimestamp) {
                  lastTimestamp = timestamp;
                }

                return (
                  <TextChatEntry contentType={entry.contentType}
                                 dispatcher={this.props.dispatcher}
                                 extraData={entry.extraData}
                                 key={i}
                                 message={entry.message}
                                 showTimestamp={shouldShowTimestamp}
                                 timestamp={timestamp}
                                 type={entry.type}
                                 useDesktopPaths={this.props.useDesktopPaths} />
                  );
              }, this)
            }
          </div>
        </div>
      );
    },

    /**
     * Decide to show timestamp or not on a message.
     * If the time difference between two consecutive messages is bigger than
     * one minute or if message types are different.
     *
     * @param {number} idx       Index of message in the messageList.
     * @param {boolean} timeDiff If difference between consecutive messages is
     *                           bigger than one minute.
     */
    _shouldShowTimestamp: function(idx, timeDiff) {
      if (!idx) {
        return true;
      }

      /* If consecutive messages are from different senders */
      if (this.props.messageList[idx].type !==
          this.props.messageList[idx - 1].type) {
        return true;
      }

      return timeDiff;
    },

    /**
     * Determines if difference between the two timestamp arguments
     * is bigger that 60 (1 minute)
     *
     * Timestamps are using ISO8601 format.
     *
     * @param {string} currTime Timestamp of message yet to be rendered.
     * @param {string} prevTime Last timestamp printed in the chat view.
     */
    _isOneMinDelta: function(currTime, prevTime) {
      var date1 = new Date(currTime);
      var date2 = new Date(prevTime);
      var delta = date1 - date2;

      if (delta / 1000 >= this.constructor.ONE_MINUTE) {
        return true;
      }

      return false;
    }
  });

  /**
   * Displays a text chat entry input box for sending messages.
   *
   * @property {loop.Dispatcher} dispatcher
   * @property {Boolean} showPlaceholder    Set to true to show the placeholder message.
   * @property {Boolean} textChatEnabled    Set to true to enable the box. If false, the
   *                                        text chat box won't be displayed.
   */
  var TextChatInputView = React.createClass({
    mixins: [
      React.addons.LinkedStateMixin,
      React.addons.PureRenderMixin
    ],

    propTypes: {
      dispatcher: React.PropTypes.instanceOf(loop.Dispatcher).isRequired,
      showPlaceholder: React.PropTypes.bool.isRequired,
      textChatEnabled: React.PropTypes.bool.isRequired
    },

    getInitialState: function() {
      return {
        messageDetail: ""
      };
    },

    /**
     * Handles a key being pressed - looking for the return key for submitting
     * the form.
     *
     * @param {Object} event The DOM event.
     */
    handleKeyDown: function(event) {
      if (event.which === 13) {
        this.handleFormSubmit(event);
      }
    },

    /**
     * Handles submitting of the form - dispatches a send text chat message.
     *
     * @param {Object} event The DOM event.
     */
    handleFormSubmit: function(event) {
      event.preventDefault();

      // Don't send empty messages.
      if (!this.state.messageDetail) {
        return;
      }

      this.props.dispatcher.dispatch(new sharedActions.SendTextChatMessage({
        contentType: CHAT_CONTENT_TYPES.TEXT,
        message: this.state.messageDetail,
        sentTimestamp: (new Date()).toISOString()
      }));

      // Reset the form to empty, ready for the next message.
      this.setState({ messageDetail: "" });
    },

    render: function() {
      if (!this.props.textChatEnabled) {
        return null;
      }

      return (
        <div className="text-chat-box">
          <form onSubmit={this.handleFormSubmit}>
            <input
              onKeyDown={this.handleKeyDown}
              placeholder={this.props.showPlaceholder ? mozL10n.get("chat_textbox_placeholder") : ""}
              type="text"
              valueLink={this.linkState("messageDetail")} />
          </form>
        </div>
      );
    }
  });

  /**
   * Displays the text chat view. This includes the text chat messages as well
   * as a field for entering new messages.
   *
   * @property {loop.Dispatcher} dispatcher
   * @property {Boolean}         showInitialContext Set to true to show the room name
   *                                          and initial context tile for linker clicker's special list items
   */
  var TextChatView = React.createClass({
    mixins: [
      React.addons.LinkedStateMixin,
      loop.store.StoreMixin("textChatStore")
    ],

    propTypes: {
      dispatcher: React.PropTypes.instanceOf(loop.Dispatcher).isRequired,
      showInitialContext: React.PropTypes.bool.isRequired,
      useDesktopPaths: React.PropTypes.bool.isRequired
    },

    getInitialState: function() {
      return this.getStoreState();
    },

    render: function() {
      var messageList = this.state.messageList;

      // Filter out items not displayed when showing initial context.
      // We do this here so that we can set the classes correctly on the view.
      if (!this.props.showInitialContext) {
        messageList = messageList.filter(function(item) {
          return item.type !== CHAT_MESSAGE_TYPES.SPECIAL ||
            (item.contentType !== CHAT_CONTENT_TYPES.ROOM_NAME &&
             item.contentType !== CHAT_CONTENT_TYPES.CONTEXT);
        });
      }

      // Only show the placeholder if we've sent messages.
      var hasSentMessages = messageList.some(function(item) {
        return item.type === CHAT_MESSAGE_TYPES.SENT;
      });

      var textChatViewClasses = classNames({
        "text-chat-view": true,
        "text-chat-entries-empty": !messageList.length,
        "text-chat-disabled": !this.state.textChatEnabled
      });

      return (
        <div className={textChatViewClasses}>
          <TextChatEntriesView
            dispatcher={this.props.dispatcher}
            messageList={messageList}
            showInitialContext={this.props.showInitialContext}
            useDesktopPaths={this.props.useDesktopPaths} />
          <TextChatInputView
            dispatcher={this.props.dispatcher}
            showPlaceholder={!hasSentMessages}
            textChatEnabled={this.state.textChatEnabled} />
        </div>
      );
    }
  });

  return {
    TextChatEntriesView: TextChatEntriesView,
    TextChatEntry: TextChatEntry,
    TextChatView: TextChatView
  };
})(navigator.mozL10n || document.mozL10n);
