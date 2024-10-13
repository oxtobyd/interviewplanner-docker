import React, { useState, useEffect } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { Edit, Trash2, ListOrdered } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

interface PanelDate {
  id: string;
  date: string;
  zoomLink: string;
}

const PanelDates: React.FC = () => {
  const [panelDates, setPanelDates] = useState<PanelDate[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [panelDateToDelete, setPanelDateToDelete] = useState<string | null>(null);
  const { register, handleSubmit, reset } = useForm<PanelDate>();
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'panelDates'), (snapshot) => {
      const panelDatesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PanelDate));
      setPanelDates(panelDatesData.sort((a, b) => a.date.localeCompare(b.date)));
    });

    return () => unsubscribe();
  }, []);

  const onSubmit: SubmitHandler<PanelDate> = async (data) => {
    try {
      const { id, ...dataWithoutId } = data; // Remove the id field from the data
      if (editingId) {
        const panelDateRef = doc(db, 'panelDates', editingId);
        await updateDoc(panelDateRef, dataWithoutId);
        setEditingId(null);
      } else {
        await addDoc(collection(db, 'panelDates'), dataWithoutId);
      }
      reset({ date: '', zoomLink: '' });
    } catch (error) {
      console.error("Error adding/updating Panel Date:", error);
    }
  };

  const editPanelDate = (panelDate: PanelDate) => {
    setEditingId(panelDate.id);
    reset(panelDate);
  };

  const deletePanelDate = (id: string) => {
    setPanelDateToDelete(id);
  };

  const confirmDelete = async () => {
    if (panelDateToDelete) {
      try {
        await deleteDoc(doc(db, 'panelDates', panelDateToDelete));
        setPanelDateToDelete(null);
      } catch (error) {
        console.error("Error deleting Panel Date:", error);
      }
    }
  };

  const generateReport = (panelDateId: string) => {
    // Navigate to a new page that will handle the report generation
    navigate(`/panel-date-report/${panelDateId}`);
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Panel Dates</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="mb-8 bg-white p-6 rounded-lg shadow-md">
        <div className="flex space-x-4 mb-4">
          <input {...register('date')} type="date" className="input w-1/2" />
          <input {...register('zoomLink')} type="url" placeholder="Zoom Link" className="input w-1/2" />
        </div>
        <button type="submit" className="btn-primary">
          {editingId ? 'Update Panel Date' : 'Add Panel Date'}
        </button>
      </form>
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-40">Date</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Zoom Link</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {panelDates.map((panelDate) => (
              <tr key={panelDate.id}>
                <td className="px-4 py-2 whitespace-nowrap">
                  <span className="inline-block max-w-[15ch] truncate" title={new Date(panelDate.date).toLocaleDateString()}>
                    {new Date(panelDate.date).toLocaleDateString()}
                  </span>
                </td>
                <td className="px-4 py-2 whitespace-nowrap">
                  <a href={panelDate.zoomLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    <span className="inline-block max-w-[30ch] truncate" title={panelDate.zoomLink}>
                      {panelDate.zoomLink}
                    </span>
                  </a>
                </td>
                <td className="px-4 py-2 whitespace-nowrap">
                  <button 
                    onClick={() => editPanelDate(panelDate)} 
                    className="text-blue-600 hover:text-blue-900 mr-2"
                    title="Edit Panel Date"
                  >
                    <Edit className="h-5 w-5" />
                  </button>
                  <button 
                    onClick={() => deletePanelDate(panelDate.id)} 
                    className="text-red-600 hover:text-red-900 mr-2"
                    title="Delete Panel Date"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                  <button 
                    onClick={() => generateReport(panelDate.id)} 
                    className="text-green-600 hover:text-green-900"
                    title="Generate Running Order"
                  >
                    <ListOrdered className="h-5 w-5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {panelDateToDelete && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3 text-center">
              <h3 className="text-lg leading-6 font-medium text-gray-900">Delete Panel Date</h3>
              <div className="mt-2 px-7 py-3">
                <p className="text-sm text-gray-500">
                  Are you sure you want to delete this panel date? This action cannot be undone.
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
                  onClick={() => setPanelDateToDelete(null)}
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

export default PanelDates;
