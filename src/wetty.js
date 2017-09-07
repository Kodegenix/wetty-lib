import {lib, hterm} from './hterm_all';

let term = null;
let buf = '';

export function create(socket, terminalId) {
    function onSshStarted() {

        console.log('ssh.started event received')

        function socketOnOutput (data) {
            if (!term) {
                buf += data;
                return;
            }
            term.io.writeUTF8(data);
        }
        function socketOnLogout() {
            console.log('on logout')

            socket.removeListener('output', socketOnOutput);
            socket.removeListener('ssh.started', onSshStarted);
            socket.removeListener('ssh.disconnect', socketOnSshDisconnect);
            socket.removeListener('logout', socketOnLogout);
        }
        function socketOnSshDisconnect() {
            console.log('on ssh.disconnect')

            socket.removeListener('output', socketOnOutput);
            socket.removeListener('ssh.started', onSshStarted);
            socket.removeListener('logout', socketOnLogout);
            socket.removeListener('ssh.disconnect', socketOnSshDisconnect);
        }

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

            term.runCommandClass(Wetty, document.location.hash.substr(1));
            socket.emit('resize', {
                col: term.screenSize.width,
                row: term.screenSize.height,
            });

            if (buf && buf !== '') {
                term.io.writeUTF8(buf);
                buf = '';
            }

            socket.on('output', socketOnOutput);

            socket.on('logout', socketOnLogout);

            socket.on('ssh.disconnect', socketOnSshDisconnect);
        });

    }

    class Wetty {
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
            socket.emit('input', str);
        }

        onTerminalResize(col, row) {
            socket.emit('resize', {col, row});
        }
    }

    console.log('create')

    socket.on('ssh.started', onSshStarted);
}
