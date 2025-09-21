import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { v4 as uuidv4 } from "uuid";

export async function uploadFile(file: File, folder: string = "uploads") {
  const storage = getStorage();
  const fileId = uuidv4();
  const ext = file.name.split('.').pop();
  const storageRef = ref(storage, `${folder}/${fileId}.${ext}`);
  await uploadBytes(storageRef, file);
  return await getDownloadURL(storageRef);
}
