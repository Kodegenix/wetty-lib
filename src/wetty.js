import {lib, hterm} from './hterm_all';

const Q = require('q')
let term = null;
let buf = '';


const wetty = {
    init: function (socket, terminalId) {
        const deferred = Q.defer();
        const self = this;
        self.socket = socket;
        self.terminalId = terminalId;

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
                socket.emit('input', str);
            }

            onTerminalResize(col, row) {
                socket.emit('resize', {col, row});
            }
        }

        // console.log('ssh.started event received')

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

            term.runCommandClass(Command, document.location.hash.substr(1));

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
    },
    connect: function (config) {
        const socket = this.socket;
        const term = this.term;
        const self = this;


        function socketOnOutput(data) {
            if (!term) {
                buf += data;
                return;
            }
            term.io.writeUTF8(data);
        }

        function socketOnLogout() { // TODO merge
            console.log('on logout')

            document.getElementById(self.terminalId).remove()

            socket.removeListener('output', socketOnOutput);
            // socket.removeListener('ssh.started', onSshStarted);
            socket.removeListener('ssh.disconnect', socketOnSshDisconnect);
            socket.removeListener('logout', socketOnLogout);
        }

        function socketOnSshDisconnect() {// TODO merge
            console.log('on ssh.disconnect')
            document.getElementById(self.terminalId).remove()

            socket.removeListener('output', socketOnOutput);
            // socket.removeListener('ssh.started', onSshStarted);
            socket.removeListener('logout', socketOnLogout);
            socket.removeListener('ssh.disconnect', socketOnSshDisconnect);
        }

        socket.emit('resize', {
            col: term.screenSize.width,
            row: term.screenSize.height,
        });

        socket.on('output', socketOnOutput);

        socket.on('logout', socketOnLogout);

        socket.on('ssh.disconnect', socketOnSshDisconnect);

        socket.emit('ssh.start', config)

    },

    disconnect: function () {
        this.socket.emit('ssh.disconnect', {})

    }
}
export {wetty};
