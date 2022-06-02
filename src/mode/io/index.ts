import * as dgram from 'dgram';

interface MsgRequest {
  buf: Buffer;
  remotePort: number;
  remoteIp: string;
  socket: dgram.Socket;
  offset?: number;
}

// udp response time
const RESPONSE_TIME = 0.8e3;

function closeSocket(socket: dgram.Socket) {
  if (socket) {
    socket.removeAllListeners();
    socket.close();
  }
}

/**
 * @desc 创建一个随机端口的Udp套接字
 *
 * @author kerwin_v
 * @date 23/12/2021
 * @return {dgram.Socket}  {Promise<dgram.Socket>}
 */
function createRandomPortSocket(): Promise<dgram.Socket> {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket({
      type: 'udp4',
      reuseAddr: true,
      recvBufferSize: 2048,
    });

    socket.on('error', (err: Error) => {
      closeSocket(socket);
      reject(err);
    });

    socket.bind(0, () => {
      resolve(socket);
    });
  });
}

function sendMsgTo(data: MsgRequest): Promise<Buffer | null> {
  const {buf, socket, remoteIp, remotePort} = data;
  let timer: NodeJS.Timeout;
  return new Promise((resolve, reject) => {
    if (!socket || !data || buf.byteLength <= 0) {
      reject('param error');
      return;
    }
    const onMsg = (resp: Buffer) => {
      timer && clearTimeout(timer);
      resolve(resp);
    };
    socket.once('message', onMsg);

    try {
      socket.send(buf, 0, buf.length, remotePort, remoteIp, () => {
        timer = setTimeout(() => {
          socket.off('message', onMsg); // 释放压栈
          resolve(null);
        }, RESPONSE_TIME);
      });
    } catch (e) {
      reject(e);
    }
  });
}

export {createRandomPortSocket, sendMsgTo, closeSocket};
