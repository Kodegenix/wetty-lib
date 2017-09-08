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
        let term;

        lib.init(() => {
            hterm.defaultStorage = new lib.Storage.Local();
            term = new hterm.Terminal();
            // window.term = term;
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
            term.setHeight(30)
            term.setWidth(150)


            if (buf && buf !== '') {
                term.io.writeUTF8(buf);
                buf = '';
            }

            console.log('resolve')
            self.term = term;
            deferred.resolve();
        });


        console.log('init')
        // socket.on('ssh.started', onSshStarted);
        return deferred.promise;
    }

    connect(config) {
        console.log('connect')
        const socket = this.socket;
        const term = this.term;
        const self = this;

        let buf = self.buf;
        const reqId = uuid.v4();

        function onSshStarted(connId) {
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
                }

                onTerminalResize(col, row) {
                    socket.emit('ssh.resize' + connId, {col, row});
                }
            }


            function socketOnOutput(data) {
                if (!term) {
                    buf += data;
                    return;
                }
                term.io.writeUTF8(data);
            }

            function socketOnLogout() { // TODO merge
                console.log('on logout')

                removeAllChildren(document.getElementById(self.terminalId))

                socket.removeListener('output', socketOnOutput);
                // socket.removeListener('ssh.started', onSshStarted);
                socket.removeListener('ssh.disconnect', socketOnSshDisconnect);
                socket.removeListener('logout', socketOnLogout);
            }

            function socketOnSshDisconnect() {// TODO merge
                console.log('on ssh.disconnect')
                removeAllChildren(document.getElementById(self.terminalId))

                socket.removeListener('ssh.output', socketOnOutput);
                // socket.removeListener('ssh.started', onSshStarted);
                socket.removeListener('ssh.logout', socketOnLogout);
                socket.removeListener('ssh.disconnect', socketOnSshDisconnect);
            }


            socket.emit('ssh.resize' + connId, {
                col: term.screenSize.width,
                row: term.screenSize.height,
            });

            socket.on('ssh.output' + connId, socketOnOutput);

            socket.on('ssh.logout' + connId, socketOnLogout);

            socket.on('ssh.disconnect' + connId, socketOnSshDisconnect);
            term.runCommandClass(Command);

        }


        socket.on('ssh.started' + reqId, onSshStarted)
        console.log('emit...')

        socket.emit('ssh.start', {reqId, config})
    }

    disconnect() {
        this.socket.emit('ssh.disconnect', {})

    }
}

export {Wetty};
