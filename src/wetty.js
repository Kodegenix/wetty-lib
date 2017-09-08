"use strict";
import {lib, hterm} from './hterm_all';
import uuid from 'uuid'

const Q = require('q')

function removeAllChildren(elem) {
    while (elem.firstChild) elem.removeChild(elem.firstChild);
}

class Wetty {
    init(socket, terminalId) {
        const deferred = Q.defer();
        const self = this;
        let buf = '';
        self.socket = socket;
        self.terminalId = terminalId;
        self.buf = buf;

        lib.init(() => {
            hterm.defaultStorage = new lib.Storage.Local();
            let term = new hterm.Terminal();
            term.decorate(document.getElementById(terminalId));

            term.setCursorPosition(0, 0);
            term.setCursorVisible(true);
            term.prefs_.set('ctrl-c-copy', true);
            term.prefs_.set('ctrl-v-paste', true);
            term.prefs_.set('use-default-window-copy', true);
            term.prefs_.set('send-encoding', 'raw');
            term.prefs_.set('receive-encoding', 'raw');
            term.prefs_.set('font-size', 14);
            term.scrollPort_.screen_.setAttribute('spellcheck', 'false');
            term.scrollPort_.screen_.setAttribute('autocorrect', 'false');
            term.scrollPort_.screen_.setAttribute('autocomplete', 'false');
            term.scrollPort_.screen_.setAttribute('contenteditable', 'false');
            term.setHeight(15)
            term.setWidth(150)


            if (buf && buf !== '') {
                term.io.writeUTF8(buf);
                buf = '';
            }

            self.term = term;
            deferred.resolve();
        });

        return deferred.promise;
    }

    connect(config) {
        const socket = this.socket;
        const term = this.term;
        const self = this;

        let buf = self.buf;

        function onSshStarted(connId) {
            self.connId = connId;

            class Command {
                constructor(argv) {
                    this.argv_ = argv;
                    this.io = null;
                    this.pid_ = -1;
                }

                run() {
                    this.io = this.argv_.io.push();
                    this.io.onVTKeystroke = this.sendString_.bind(this);
                    this.io.sendString = this.sendString_.bind(this);
                    this.io.onTerminalResize = this.onTerminalResize.bind(this);
                }

                sendString_(str) {
                    socket.emit('ssh.input' + connId, str);
                    // console.log('sending to ' + connId + '\n ' + str)
                }

                onTerminalResize(col, row) {
                    socket.emit('ssh.resize' + connId, {col, row});
                }
            }

            function socketOnOutput(data) {
                // console.log('output from ' + self.connId + ' \n' + data)
                if (!term) {
                    buf += data;
                    return;
                }
                term.io.writeUTF8(data);
            }

            function cleanup() { // TODO merge
                console.log('disconnected, cleanup...')
                removeAllChildren(document.getElementById(self.terminalId))

                socket.removeListener('ssh.output' + connId, socketOnOutput);
                socket.removeListener('ssh.started' + connId, onSshStarted);
                socket.removeListener('ssh.disconnect' + connId, cleanup);
                socket.removeListener('ssh.logout' + connId, cleanup);
                if (self.disconnectedCb) {
                    self.disconnectedCb()
                }
            }

            socket.emit('ssh.resize' + connId, {
                col: term.screenSize.width,
                row: term.screenSize.height,
            });

            socket.on('ssh.output' + connId, socketOnOutput);
            socket.on('ssh.logout' + connId, cleanup);
            socket.on('ssh.disconnect' + connId, cleanup);
            term.runCommandClass(Command);
        }

        const connId = uuid.v4();

        socket.on('ssh.started' + connId, onSshStarted)

        socket.emit('ssh.start', {connId, config})
    }

    disconnect() {
        this.socket.emit('ssh.disconnect' + this.connId, {})
    }

    onDisconnected(cb) {
        this.disconnectedCb = cb;
    }
}

export {Wetty};
