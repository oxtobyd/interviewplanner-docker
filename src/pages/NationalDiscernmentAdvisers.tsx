import React, { useState, useEffect } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { Edit, Trash2 } from 'lucide-react';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

interface NDA {
  id: string;
  title: string; // New field for title
  name: string;
  email: string;
}

const NationalDiscernmentAdvisers: React.FC = () => {
  const [ndas, setNDAs] = useState<NDA[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [ndaToDelete, setNdaToDelete] = useState<string | null>(null);
  const { register, handleSubmit, reset } = useForm<NDA>();

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'ndas'), (snapshot) => {
      const ndasData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as NDA));
      setNDAs(ndasData);
    });

    return () => unsubscribe();
  }, []);

  const onSubmit: SubmitHandler<NDA> = async (data) => {
    try {
      const { id, ...dataWithoutId } = data; // Remove the id field from the data
      if (editingId) {
        const ndaRef = doc(db, 'ndas', editingId);
        await updateDoc(ndaRef, dataWithoutId);
        setEditingId(null);
      } else {
        await addDoc(collection(db, 'ndas'), dataWithoutId);
      }
      // Reset form fields
      reset({ title: '', name: '', email: '' });
    } catch (error) {
      console.error("Error adding/updating NDA:", error);
    }
  };

  const editNDA = (nda: NDA) => {
    setEditingId(nda.id);
    reset(nda);
  };

  const deleteNDA = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'ndas', id));
      // Reset form fields after deletion
      reset({ title: '', name: '', email: '' });
    } catch (error) {
      console.error("Error deleting NDA:", error);
    }
  };

  const confirmDelete = async () => {
    if (ndaToDelete) {
      try {
        await deleteDoc(doc(db, 'ndas', ndaToDelete));
        setNdaToDelete(null);
      } catch (error) {
        console.error("Error deleting NDA:", error);
      }
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">National Discernment Advisers</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="mb-8 bg-white p-6 rounded-lg shadow-md">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input {...register('title')} placeholder="Title" className="input" />
          <input {...register('name')} placeholder="Adviser Name" className="input" />
          <input {...register('email')} placeholder="Email" type="email" className="input" />
        </div>
        <button type="submit" className="btn-primary mt-4">
          {editingId ? 'Update Adviser' : 'Add Adviser'}
        </button>
      </form>
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {ndas.map((nda) => (
              <tr key={nda.id}>
                <td className="px-4 py-2 whitespace-nowrap">{nda.title}</td>
                <td className="px-4 py-2 whitespace-nowrap">{nda.name}</td>
                <td className="px-4 py-2 whitespace-nowrap">{nda.email}</td>
                <td className="px-4 py-2 whitespace-nowrap">
                  <button onClick={() => editNDA(nda)} className="text-blue-600 hover:text-blue-900 mr-2">
                    <Edit className="h-5 w-5" />
                  </button>
                  <button onClick={() => deleteNDA(nda.id)} className="text-red-600 hover:text-red-900">
                    <Trash2 className="h-5 w-5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ndaToDelete && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3 text-center">
              <h3 className="text-lg leading-6 font-medium text-gray-900">Delete National Discernment Adviser</h3>
              <div className="mt-2 px-7 py-3">
                <p className="text-sm text-gray-500">
                  Are you sure you want to delete this NDA? This action cannot be undone.
                </p>
              </div>
              <div className="items-center px-4 py-3">
                <button
                  onClick={confirmDelete}
                  className="px-4 py-2 bg-red-500 text-white text-base font-medium rounded-md w-full shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-300"
                >
                  Delete
                </button>
                <button
                  onClick={() => setNdaToDelete(null)}
                  className="mt-3 px-4 py-2 bg-white text-gray-800 text-base font-medium rounded-md w-full shadow-sm border border-gray-300 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NationalDiscernmentAdvisers;
