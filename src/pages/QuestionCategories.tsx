import React, { useState, useEffect } from 'react';
import { Edit, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

interface Attribute {
  id: string;
  name: string;
}

interface QuestionCategory {
  id: string;
  category: string;
  attributes: Attribute[];
  generalCategory: 'Selection Qualities' | 'Formation Qualities' | 'Selection Criteria' | 'Formation Criteria';
  answerTheQuestion: boolean;
  requiredPaperwork: string[];
}

const truncateText = (text: string, maxLength: number) => {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
};

// Add this near the top of your file, outside of the component function
const paperworkOptions = [
  "Proforma for Submission to the Candidates Panel",
  "CP Reference from Incumbent - Church Leader",
  "CP Reference from outside Church context",
  "CP Registration Form",
  "Ethnic Diversity Form",
  "Stage 2/TODP/BAP Report",
  "TEI Report",
  "Reference from Provincial Anglican official",
  "Training Completed Information",
  "Additional Reference (denominational/Provincial official)",
  "Others Reports (those who have mentored or worked with Candidate)",
  "PTL Evidence",
  "TEI Supporting Statement",
  "Other Paperwork"
];

const QuestionCategories: React.FC = () => {
  const [categories, setCategories] = useState<QuestionCategory[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Omit<QuestionCategory, 'id'>>({
    category: '',
    attributes: [],
    generalCategory: 'Selection Qualities',
    answerTheQuestion: false,
    requiredPaperwork: [], // Ensure this is initialized as an empty array
  });
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [attributesInput, setAttributesInput] = useState('');
  const [categoryToDelete, setCategoryToDelete] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'questionCategories'), (snapshot) => {
      const categoriesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as QuestionCategory));
      setCategories(sortCategories(categoriesData, sortOrder));
    });

    return () => unsubscribe();
  }, [sortOrder]);

  const sortCategories = (cats: QuestionCategory[], order: 'asc' | 'desc') => {
    return cats.sort((a, b) => {
      if (order === 'asc') {
        return a.category.localeCompare(b.category);
      } else {
        return b.category.localeCompare(a.category);
      }
    });
  };

  const toggleSortOrder = () => {
    setSortOrder(prevOrder => prevOrder === 'asc' ? 'desc' : 'asc');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const attributes = attributesInput
        .split(';')
        .map(attr => attr.trim())
        .filter(attr => attr !== '')
        .map(attr => ({ id: crypto.randomUUID(), name: attr }));
      
      const dataToSubmit = {
        category: formData.category,
        attributes,
        generalCategory: formData.generalCategory,
        answerTheQuestion: formData.answerTheQuestion ?? false,
        requiredPaperwork: formData.requiredPaperwork || [], // Ensure this is always an array
      };

      if (editingId) {
        await updateDoc(doc(db, 'questionCategories', editingId), dataToSubmit);
      } else {
        await addDoc(collection(db, 'questionCategories'), dataToSubmit);
      }
      resetForm();
    } catch (error) {
      console.error("Error submitting form:", error);
    }
  };

  const handleEdit = (category: QuestionCategory) => {
    setEditingId(category.id);
    setFormData({
      category: category.category,
      attributes: category.attributes,
      generalCategory: category.generalCategory,
      answerTheQuestion: category.answerTheQuestion,
      requiredPaperwork: category.requiredPaperwork || [], // Use an empty array if requiredPaperwork is undefined
    });
    setAttributesInput(category.attributes.map(attr => attr.name).join('; '));
  };

  const handleDelete = (id: string) => {
    setCategoryToDelete(id);
  };

  const confirmDelete = async () => {
    if (categoryToDelete) {
      try {
        await deleteDoc(doc(db, 'questionCategories', categoryToDelete));
        setCategoryToDelete(null);
      } catch (error) {
        console.error("Error deleting category:", error);
        // Optionally, you can set an error state and display it to the user
      }
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setFormData({
      category: '',
      attributes: [],
      generalCategory: 'Selection Qualities',
      answerTheQuestion: false,
      requiredPaperwork: [], // Add this line
    });
    setAttributesInput('');
  };

  const handleAttributeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAttributesInput(e.target.value);
  };

  const handlePaperworkChange = (option: string) => {
    setFormData(prev => ({
      ...prev,
      requiredPaperwork: prev.requiredPaperwork.includes(option)
        ? prev.requiredPaperwork.filter(item => item !== option)
        : [...prev.requiredPaperwork, option]
    }));
  };

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">Question Categories</h1>
      <form onSubmit={handleSubmit} className="mb-8 bg-white p-6 rounded-lg shadow-md">
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category:</label>
            <input
              type="text"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="input w-full"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Attributes (semicolon-separated):</label>
            <input
              type="text"
              value={attributesInput}
              onChange={handleAttributeChange}
              className="input w-full"
              placeholder="Attribute 1; Attribute 2, with comma; Attribute 3"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">General Category:</label>
              <select
                value={formData.generalCategory}
                onChange={(e) => setFormData({ ...formData, generalCategory: e.target.value as QuestionCategory['generalCategory'] })}
                className="input w-full"
                required
              >
                <option value="Selection Qualities">Selection Qualities</option>
                <option value="Formation Qualities">Formation Qualities</option>
                <option value="Selection Criteria">Selection Criteria</option>
                <option value="Formation Criteria">Formation Criteria</option>
              </select>
            </div>
            <div className="flex items-center mt-4">
              <input
                type="checkbox"
                id="answerTheQuestion"
                checked={formData.answerTheQuestion}
                onChange={(e) => setFormData({ ...formData, answerTheQuestion: e.target.checked })}
                className="form-checkbox h-5 w-5 text-blue-600"
              />
              <label htmlFor="answerTheQuestion" className="ml-2 block text-sm font-medium text-gray-700">
                Answer the Question
              </label>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Required Paperwork:</label>
            <div className="grid grid-cols-2 gap-2">
              {paperworkOptions.map((option) => (
                <div key={option} className="flex items-center">
                  <input
                    type="checkbox"
                    id={`paperwork-${option}`}
                    checked={formData.requiredPaperwork?.includes(option) || false}
                    onChange={() => handlePaperworkChange(option)}
                    className="form-checkbox h-5 w-5 text-blue-600"
                  />
                  <label htmlFor={`paperwork-${option}`} className="ml-2 text-sm">
                    {option}
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>
        <button type="submit" className="btn-primary mt-4">
          {editingId ? 'Update Category' : 'Add Category'}
        </button>
      </form>
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th 
                className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                onClick={toggleSortOrder}
              >
                Category
                {sortOrder === 'asc' ? <ChevronUp className="inline ml-1 h-4 w-4" /> : <ChevronDown className="inline ml-1 h-4 w-4" />}
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Attributes</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">General Category</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Answer the Question</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {categories.map((category) => (
              <tr key={category.id}>
                <td className="px-4 py-2 whitespace-nowrap">{category.category}</td>
                <td className="px-4 py-2 whitespace-nowrap">
                  {truncateText(category.attributes.map(attr => attr.name).join(', '), 40)}
                </td>
                <td className="px-4 py-2 whitespace-nowrap">{category.generalCategory}</td>
                <td className="px-4 py-2 whitespace-nowrap">{category.answerTheQuestion ? 'Yes' : 'No'}</td>
                <td className="px-4 py-2 whitespace-nowrap">
                  <button onClick={() => handleEdit(category)} className="text-blue-600 hover:text-blue-900 mr-2">
                    <Edit className="h-5 w-5" />
                  </button>
                  <button onClick={() => handleDelete(category.id)} className="text-red-600 hover:text-red-900">
                    <Trash2 className="h-5 w-5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {categoryToDelete && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3 text-center">
              <h3 className="text-lg leading-6 font-medium text-gray-900">Delete Category</h3>
              <div className="mt-2 px-7 py-3">
                <p className="text-sm text-gray-500">
                  Are you sure you want to delete this category? This action cannot be undone.
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
                  onClick={() => setCategoryToDelete(null)}
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

export default QuestionCategories;
