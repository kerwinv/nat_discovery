import runDiscovery from './rfc_3489';

async function discovery() {
  try {
    return runDiscovery();
  } catch (e) {
    throw Error('error');
  }
}

export default discovery;
