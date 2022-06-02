import type {Socket} from 'dgram';
import {CFG_3489, NAT_TYPE} from '../constant';
import {closeSocket, createRandomPortSocket, sendMsgTo} from '../io';
import {marshal, randomTransactionId, unmarshal} from './message';

type DiscoveryOption = Partial<{
  stun: string;
  port: number;
  altPort: number;
}>;

async function transport(
  socket: Socket,
  ip: string,
  port: number,
  changeIp?: boolean
) {
  const id = randomTransactionId();
  const data = marshal({id, changeIp});
  const resp = await sendMsgTo({
    socket,
    buf: data,
    remoteIp: ip,
    remotePort: port,
  });
  return unmarshal(resp);
}

async function testI(socket: Socket, ip: string, port: number) {
  return transport(socket, ip, port);
}

async function testII(socket: Socket, ip: string, port: number) {
  return transport(socket, ip, port, true);
}

async function testIII(socket: Socket, ip: string, port: number) {
  return transport(socket, ip, port, false);
}

async function runDiscovery(options?: DiscoveryOption) {
  const {stun, port} = {...CFG_3489, ...options};
  try {
    const socket = await createRandomPortSocket();
    let res = await testI(socket, stun, port);
    if (!res.isResp) {
      closeSocket(socket);
      return NAT_TYPE.UDP_BLOCKED;
    }

    const {changedAddress: caddr, mappedAddress: maddr} = res;
    if (!caddr || !maddr) {
      closeSocket(socket);
      throw new Error('some error');
    }
    const {address: localIp} = socket.address();
    if (maddr.ip === localIp) {
      res = await testII(socket, stun, port);
      let nat_type: NAT_TYPE;
      if (!res.isResp) {
        nat_type = NAT_TYPE.SYMMETRIC_UDP_FIREWALL;
      } else {
        nat_type = NAT_TYPE.OPEN_INTERNET;
      }
      closeSocket(socket);
      return nat_type;
    }

    res = await testII(socket, stun, port);
    if (res.isResp) {
      return NAT_TYPE.FULL_CONE;
    }

    res = await testI(socket, caddr.ip, caddr.port);
    if (!res.isResp) {
      closeSocket(socket);
      return NAT_TYPE.UDP_BLOCKED;
    }
    let natType = NAT_TYPE.RESTRICTED_NAT;
    const {mappedAddress: m2addr} = res;
    if (!m2addr) {
      closeSocket(socket);
      throw new Error('some error');
    }
    if (`${maddr.ip}:${maddr.port}` !== `${m2addr.ip}:${m2addr.port}`) {
      natType = NAT_TYPE.SYMMETRIC_NAT;
    } else {
      res = await testIII(socket, stun, port);
      if (!res.isResp) {
        natType = NAT_TYPE.RESTRICTED_PORT_NAT;
      }
    }
    closeSocket(socket);
    return natType;
  } catch (e) {
    throw new Error('error');
  }
}

export default runDiscovery;
