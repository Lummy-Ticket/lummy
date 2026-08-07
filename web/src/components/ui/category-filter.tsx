"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Music, Monitor, Trophy, Palette, GraduationCap, Utensils, Film, Theater } from "lucide-react";
import { cn } from "@/lib/utils";

interface Category {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

const categories: Category[] = [
  { id: "music", name: "Music", icon: Music, color: "pastel-pink" },
  { id: "technology", name: "Technology", icon: Monitor, color: "pastel-blue" },
  { id: "sports", name: "Sports", icon: Trophy, color: "pastel-green" },
  { id: "arts", name: "Arts", icon: Palette, color: "pastel-yellow" },
  { id: "education", name: "Education", icon: GraduationCap, color: "pastel-purple" },
  { id: "food", name: "Food", icon: Utensils, color: "pastel-orange" },
  { id: "movies", name: "Movies", icon: Film, color: "pastel-blue" },
  { id: "theater", name: "Theater", icon: Theater, color: "pastel-purple" },
];

interface CategoryFilterProps {
  selectedCategory?: string;
  onCategoryChange?: (categoryId: string) => void;
  className?: string;
}

export function CategoryFilter({
  selectedCategory = "arts",
  onCategoryChange,
  className
}: CategoryFilterProps) {
  const [activeCategory, setActiveCategory] = useState(selectedCategory);

  const handleCategoryClick = (categoryId: string) => {
    setActiveCategory(categoryId);
    onCategoryChange?.(categoryId);
  };

  return (
    <div className={cn("w-full py-6", className)}>
      <div className="container mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-center gap-4 overflow-x-auto pb-2">
          {categories.map((category, index) => {
            const Icon = category.icon;
            const isActive = activeCategory === category.id;

            return (
              <motion.button
                key={category.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleCategoryClick(category.id)}
                className={cn(
                  "flex flex-col items-center gap-2 p-4 rounded-xl transition-all duration-200 min-w-fit",
                  isActive
                    ? "bg-lummy-50 border-2 border-lummy-500 shadow-md"
                    : "bg-white border-2 border-gray-200 hover:border-gray-300"
                )}
              >
                <div className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center transition-colors duration-200",
                  isActive
                    ? `bg-${category.color} text-white`
                    : `bg-${category.color} text-white`
                )}>
                  <Icon className="w-6 h-6" />
                </div>
                <span className={cn(
                  "text-xs font-medium whitespace-nowrap",
                  isActive ? "text-lummy-700" : "text-gray-600"
                )}>
                  {category.name}
                </span>
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}