import {ATTRIBUTES_TYPE, MSG_TYPE} from '../constant';

interface Address {
  ip: string;
  port: number;
}

interface MsgResponse {
  isResp: boolean;
  changedAddress?: Address;
  mappedAddress?: Address;
}

/**
 *  All STUN messages consist of a 20 byte header:

    0                   1                   2                   3
    0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
   +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   |      STUN Message Type        |         Message Length        |
   +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   |
   +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+

   +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
                            Transaction ID
   +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
                                                                   |
   +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 */
// stun message header size
const MSG_HEADER = {
  HEADER_SIZE: 20, // 总字节数
  MSG_TYPE_SIZE: 2, // 消息类型2个字节
  MSG_LENGTH_SIZE: 2, // 消息长度2字节
  TRANSACTION_ID_SIZE: 16, // id16个字节（128bit）
};

/**
 * After the header are 0 or more attributes.  Each attribute is TLV
   encoded, with a 16 bit type, 16 bit length, and variable value:

    0                   1                   2                   3
    0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
   +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   |         Type                  |            Length             |
   +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   |                             Value                             ....
   +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 */
// attributes size
const ATTRIBUTES = {
  ATTR_TYPE_SIZE: 2, // 属性类型2个字节
  ATTR_LENGTH_SIZE: 2, // 属性长度2个字节
  ATTY_CHANGE_REQUEST_SIZE: 4, // change request 字节数
};

function writeAttr(type: ATTRIBUTES_TYPE, value: number, valueSize: number) {
  const {ATTR_TYPE_SIZE, ATTR_LENGTH_SIZE} = ATTRIBUTES;
  const size = ATTR_TYPE_SIZE + ATTR_LENGTH_SIZE + valueSize;
  const buf = Buffer.alloc(size);
  let ptr = 0;
  buf.writeUInt16BE(type, ptr);
  ptr += ATTR_TYPE_SIZE;
  buf.writeUInt16BE(valueSize, ptr);
  ptr += ATTR_LENGTH_SIZE;
  buf.writeUInt32BE(value, ptr);
  return buf;
}

function changeRequest(changeIp: boolean) {
  let value = 0x02;
  if (changeIp) {
    value |= 0x04;
  }
  const buf = writeAttr(
    ATTRIBUTES_TYPE.CHANGE_REQUEST,
    value,
    ATTRIBUTES.ATTY_CHANGE_REQUEST_SIZE
  );
  return buf;
}

function writeMsgHeader(
  type: MSG_TYPE,
  transactionId: string,
  attrLen: number
) {
  const {HEADER_SIZE, MSG_TYPE_SIZE, TRANSACTION_ID_SIZE} = MSG_HEADER;
  const buf = Buffer.alloc(HEADER_SIZE - TRANSACTION_ID_SIZE);
  let ptr = 0;
  buf.writeUInt16BE(type, ptr);
  ptr += MSG_TYPE_SIZE;
  buf.writeInt16BE(attrLen, ptr);
  const transBuf = Buffer.from(transactionId, 'hex').slice(0, 16);
  return Buffer.concat([buf, transBuf]);
}

function marshal(param: {id: string; changeIp?: boolean}) {
  const {changeIp, id} = param;
  const attrBuf =
    (typeof changeIp !== 'undefined' && changeRequest(changeIp)) ||
    Buffer.from([]);
  const msgHeaderBuf = writeMsgHeader(
    MSG_TYPE.BINDING_REQUESRT,
    id,
    attrBuf.byteLength
  );
  return Buffer.concat([msgHeaderBuf, attrBuf]);
}

function randomTransactionId() {
  const chars = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  let nums = '';
  for (let i = 0; i < 32; i++) {
    const id = (Math.random() * 10) | 0;
    nums += chars[id];
  }
  return nums;
}

function parseIpAndPort(data: Buffer, start: number) {
  const ignoredSize = 1; // The first 8 bits of the MAPPED-ADDRESS are ignored
  const familySize = 1; // The address family is always 0x01
  const portSize = 2; // a sixteen bit port
  let ptr = start + ignoredSize + familySize;
  const port = data.readUInt16BE(ptr);
  ptr += portSize;
  const ipOctArrs = [];
  for (let i = 0; i < 4; i++) {
    ipOctArrs.push(data.readUInt8(ptr++));
  }
  return {
    ip: ipOctArrs.join('.'),
    port,
  };
}

function unmarshal(data: Buffer | null): MsgResponse {
  const result: MsgResponse = {
    isResp: false,
  };
  if (data !== null) {
    const {MSG_TYPE_SIZE, HEADER_SIZE} = MSG_HEADER;
    let ptr = 0;
    const msgType = data.readUInt16BE(ptr);
    if (msgType === MSG_TYPE.BINDING_RESPONSE) {
      result.isResp = true;
      ptr += MSG_TYPE_SIZE;
      let msgLen = data.readUInt16BE(ptr);
      ptr = HEADER_SIZE;
      const {ATTR_TYPE_SIZE, ATTR_LENGTH_SIZE} = ATTRIBUTES;
      while (msgLen > 0) {
        const attrType = data.readUInt16BE(ptr);
        ptr += ATTR_TYPE_SIZE;
        const attrLen = data.readUInt16BE(ptr);
        ptr += ATTR_LENGTH_SIZE;
        switch (attrType) {
          case ATTRIBUTES_TYPE.CHANGED_ADDRESS:
            result.changedAddress = parseIpAndPort(data, ptr);
            break;
          case ATTRIBUTES_TYPE.MAPPED_ADDRESS:
            result.mappedAddress = parseIpAndPort(data, ptr);
            break;
          default:
            break;
        }
        ptr += attrLen;
        msgLen -= ATTR_TYPE_SIZE + ATTR_LENGTH_SIZE + attrLen;
      }
    }
  }
  return result;
}

export {marshal, unmarshal, randomTransactionId};
