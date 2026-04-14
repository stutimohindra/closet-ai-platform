"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";

type ClosetItem = {
  id: number;
  name: string;
  category: string | null;
  color: string | null;
  size: string | null;
  brand: string | null;
  imageUrl: string | null;
  occasion: string | null;
  season: string | null;
  styleTags: string[];
  pattern: string | null;
  material: string | null;
  fit: string | null;
  aiDescription: string | null;
  analysisConfidence: number | null;
  createdAt: string;
  updatedAt: string;
};

type Recommendation = {
  url: string;
  preview: {
    pieces: {
      top: string | null;
      bottom: string | null;
      shoes: string | null;
      layer: string | null;
      accessory: string | null;
    };
    reason: string;
    stylistNote: string | null;
  };
};

type GeneratedItem = {
  key: string;
  url: string;
  lastModified: string | null;
  size: number;
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000";

export default function Home() {
  const [closetItems, setClosetItems] = useState<ClosetItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [generatedItems, setGeneratedItems] = useState<GeneratedItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [isLoadingGeneratedItems, setIsLoadingGeneratedItems] = useState(true);
  const [isSavingItem, startSavingItem] = useTransition();
  const [isGeneratingIdeas, startGeneratingIdeas] = useTransition();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Top");
  const [color, setColor] = useState("");
  const [styleTags, setStyleTags] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [ideaCount, setIdeaCount] = useState(1);

  const selectedItems = useMemo(
    () => closetItems.filter((item) => selectedIds.includes(item.id)),
    [closetItems, selectedIds],
  );

  useEffect(() => {
    void loadClosetItems();
    void loadGeneratedItems();
  }, []);

  useEffect(() => {
    if (!file) {
      setFilePreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setFilePreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  async function loadClosetItems() {
    setIsLoadingItems(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`${API_BASE_URL}/closet-items`);

      if (!response.ok) {
        throw new Error("Failed to load closet items.");
      }

      const items = (await response.json()) as ClosetItem[];
      setClosetItems(items);
      setSelectedIds((currentIds) =>
        currentIds.filter((id) => items.some((item) => item.id === id)),
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to load closet items.",
      );
    } finally {
      setIsLoadingItems(false);
    }
  }

  async function loadGeneratedItems() {
    setIsLoadingGeneratedItems(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/recommendations/generated-items`,
      );

      if (!response.ok) {
        throw new Error("Failed to load generated outfit images.");
      }

      const result = (await response.json()) as {
        items: GeneratedItem[];
      };

      setGeneratedItems(result.items ?? []);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to load generated outfit images.",
      );
    } finally {
      setIsLoadingGeneratedItems(false);
    }
  }

  async function handleAddItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file) {
      setErrorMessage("Choose an image before saving a closet item.");
      return;
    }

    startSavingItem(async () => {
      setErrorMessage(null);
      setStatusMessage("Uploading image and saving item...");

      try {
        const imageDataUrl = await fileToDataUrl(file);
        const uploadResponse = await fetch(
          `${API_BASE_URL}/closet-items/upload-image`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              imageDataUrl,
              contentType: file.type,
              fileExtension: getFileExtension(file.name),
              fileName: file.name,
            }),
          },
        );

        if (!uploadResponse.ok) {
          throw new Error("Failed to upload the image to S3.");
        }

        const uploadResult = (await uploadResponse.json()) as {
          upload: { url: string };
        };

        const createResponse = await fetch(`${API_BASE_URL}/closet-items`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: name.trim() || getNameFromFile(file.name),
            category,
            color: color.trim() || undefined,
            imageUrl: uploadResult.upload.url,
            styleTags: normalizeTags(styleTags),
          }),
        });

        if (!createResponse.ok) {
          throw new Error("Failed to save the closet item.");
        }

        const createdItem = (await createResponse.json()) as ClosetItem;
        setClosetItems((currentItems) => [...currentItems, createdItem]);
        setSelectedIds((currentIds) => [...currentIds, createdItem.id]);
        setName("");
        setCategory("Top");
        setColor("");
        setStyleTags("");
        setFile(null);
        setStatusMessage("Closet item saved.");
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to save the item.",
        );
        setStatusMessage(null);
      }
    });
  }

  async function handleGenerateIdeas() {
    if (selectedItems.length === 0) {
      setErrorMessage(
        "Select at least one closet item to generate outfit ideas.",
      );
      return;
    }

    startGeneratingIdeas(async () => {
      setErrorMessage(null);
      setStatusMessage("Generating outfit ideas...");

      try {
        const response = await fetch(
          `${API_BASE_URL}/recommendations/generate`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              itemImageUrls: selectedItems
                .map((item) => item.imageUrl)
                .filter(Boolean),
              count: ideaCount,
              renderImages: true,
              background: "soft neutral studio backdrop",
              aspectRatio: "4:5",
              mood: "minimal luxury editorial",
              genderPresentation: "women's fashion editorial",
            }),
          },
        );

        if (!response.ok) {
          throw new Error("Failed to generate outfit ideas.");
        }

        const result = (await response.json()) as {
          recommendations: Recommendation[];
        };

        await loadGeneratedItems();
        setStatusMessage(
          result.recommendations?.length
            ? "Outfit ideas ready."
            : "No outfit ideas were returned yet.",
        );
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Failed to generate outfit ideas.",
        );
        setStatusMessage(null);
      }
    });
  }

  function toggleItemSelection(itemId: number) {
    setSelectedIds((currentIds) =>
      currentIds.includes(itemId)
        ? currentIds.filter((id) => id !== itemId)
        : [...currentIds, itemId],
    );
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f8f2e8_0%,#f6f1eb_35%,#f2f5f0_100%)] text-stone-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 py-8 sm:px-8 lg:px-10">
        <section className="overflow-hidden rounded-[2rem] border border-stone-200/70 bg-white/80 shadow-[0_24px_80px_rgba(83,57,33,0.08)] backdrop-blur">
          <div className="px-6 py-8 lg:px-10">
            <div className="space-y-5 text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-stone-500">
                Closet AI
              </p>
              <h1 className="mx-auto max-w-2xl text-4xl font-semibold tracking-tight text-stone-950 sm:text-5xl">
                Build your closet and turn selections into outfit ideas.
              </h1>
              <p className="mx-auto max-w-2xl text-base leading-7 text-stone-600 sm:text-lg">
                Upload a clothing image, save it as a closet item, then select
                the pieces you want to style together. The backend stores your
                images in S3 and returns generated recommendation cards.
              </p>
              <div className="flex flex-wrap justify-center gap-3 text-sm">
                <Badge label={`${closetItems.length} items saved`} />
                <Badge label={`${selectedItems.length} selected`} />
                <Badge label={`${generatedItems.length} generated items`} />
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-8 xl:grid-cols-[420px_minmax(0,1fr)]">
          <div className="rounded-[1.75rem] border border-stone-200/80 bg-white/85 p-6 shadow-[0_20px_60px_rgba(83,57,33,0.08)]">
            <div className="mb-5 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-stone-500">
                Add Clothing
              </p>
              <h2 className="text-2xl font-semibold text-stone-950">
                Upload a new closet item
              </h2>
            </div>

            <form className="space-y-4" onSubmit={handleAddItem}>
              <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-[1.5rem] border border-dashed border-stone-300 bg-stone-50 px-4 py-5 text-center transition hover:border-stone-400 hover:bg-stone-100">
                {filePreviewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt="Selected clothing item preview"
                    className="h-48 w-full rounded-[1.25rem] object-cover"
                    src={filePreviewUrl}
                  />
                ) : (
                  <div className="flex h-48 w-full items-center justify-center rounded-[1.25rem] bg-[radial-gradient(circle_at_top,#f3e3c2,transparent_55%),#f5f1ea] text-sm font-medium text-stone-500">
                    Choose an image to upload
                  </div>
                )}
                <span className="text-sm font-medium text-stone-700">
                  {file ? file.name : "Select image"}
                </span>
                <input
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    setFile(event.target.files?.[0] ?? null);
                  }}
                  type="file"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Item name"
                  onChange={setName}
                  placeholder="White Tee"
                  value={name}
                />
                <label className="space-y-2 text-sm font-medium text-stone-700">
                  <span>Category</span>
                  <select
                    className="w-full rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 outline-none transition focus:border-stone-500 focus:bg-white"
                    onChange={(event) => setCategory(event.target.value)}
                    value={category}
                  >
                    {[
                      "Top",
                      "Bottom",
                      "Shoes",
                      "Layer",
                      "Accessory",
                      "Dress",
                    ].map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Color"
                  onChange={setColor}
                  placeholder="Black"
                  value={color}
                />
                <Field
                  label="Style tags"
                  onChange={setStyleTags}
                  placeholder="minimal, casual"
                  value={styleTags}
                />
              </div>

              <button
                className="inline-flex w-full items-center justify-center rounded-full bg-stone-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400"
                disabled={isSavingItem}
                type="submit"
              >
                {isSavingItem ? "Saving..." : "Save Closet Item"}
              </button>
            </form>
          </div>

          <div className="space-y-8">
            <section className="rounded-[1.75rem] border border-stone-200/80 bg-white/85 p-6 shadow-[0_20px_60px_rgba(83,57,33,0.08)]">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-stone-500">
                    Closet
                  </p>
                  <h2 className="text-2xl font-semibold text-stone-950">
                    Saved clothing items
                  </h2>
                </div>

                <div className="flex items-center gap-3">
                  <label className="space-y-2 text-sm font-medium text-stone-700">
                    <span>Ideas to generate</span>
                    <select
                      className="rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 outline-none transition focus:border-stone-500 focus:bg-white"
                      onChange={(event) =>
                        setIdeaCount(Number(event.target.value))
                      }
                      value={ideaCount}
                    >
                      {[1, 2, 3].map((count) => (
                        <option key={count} value={count}>
                          {count}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="inline-flex h-fit items-center justify-center rounded-full bg-[#8c5d3c] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#774e31] disabled:cursor-not-allowed disabled:bg-stone-400"
                    disabled={isGeneratingIdeas || selectedItems.length === 0}
                    onClick={handleGenerateIdeas}
                    type="button"
                  >
                    {isGeneratingIdeas
                      ? "Generating..."
                      : "Create Outfit Ideas"}
                  </button>
                </div>
              </div>

              {errorMessage ? (
                <p className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {errorMessage}
                </p>
              ) : null}

              {statusMessage ? (
                <p className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {statusMessage}
                </p>
              ) : null}

              {isLoadingItems ? (
                <p className="text-sm text-stone-500">
                  Loading closet items...
                </p>
              ) : closetItems.length === 0 ? (
                <p className="rounded-[1.5rem] border border-dashed border-stone-300 bg-stone-50 px-5 py-10 text-center text-sm text-stone-500">
                  No clothing items yet. Upload your first piece on the left.
                </p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {closetItems.map((item) => {
                    const isSelected = selectedIds.includes(item.id);

                    return (
                      <button
                        className={`group overflow-hidden rounded-[1.5rem] border text-left transition ${
                          isSelected
                            ? "border-stone-950 bg-stone-950 text-white shadow-[0_24px_50px_rgba(0,0,0,0.2)]"
                            : "border-stone-200 bg-stone-50 hover:border-stone-400 hover:bg-white"
                        }`}
                        key={item.id}
                        onClick={() => toggleItemSelection(item.id)}
                        type="button"
                      >
                        <div className="aspect-[4/5] overflow-hidden bg-stone-200">
                          {item.imageUrl ? (
                            <div className="relative h-full w-full">
                              <Image
                                alt={item.name}
                                className="object-cover transition duration-300 group-hover:scale-[1.02]"
                                fill
                                sizes="(min-width: 1280px) 22vw, (min-width: 640px) 40vw, 90vw"
                                src={item.imageUrl}
                              />
                            </div>
                          ) : (
                            <div className="flex h-full items-center justify-center text-sm text-stone-500">
                              No image
                            </div>
                          )}
                        </div>
                        <div className="space-y-2 px-4 py-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h3 className="text-base font-semibold">
                                {item.name}
                              </h3>
                              <p
                                className={`text-sm ${
                                  isSelected
                                    ? "text-stone-300"
                                    : "text-stone-500"
                                }`}
                              >
                                {item.category ?? "Uncategorized"}
                                {item.color ? ` · ${item.color}` : ""}
                              </p>
                            </div>
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                isSelected
                                  ? "bg-white/10 text-white"
                                  : "bg-stone-200 text-stone-700"
                              }`}
                            >
                              {isSelected ? "Selected" : "Select"}
                            </span>
                          </div>
                          {item.styleTags.length > 0 ? (
                            <p
                              className={`text-xs ${
                                isSelected ? "text-stone-300" : "text-stone-500"
                              }`}
                            >
                              {item.styleTags.join(" · ")}
                            </p>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="rounded-[1.75rem] border border-stone-200/80 bg-white/85 p-6 shadow-[0_20px_60px_rgba(83,57,33,0.08)]">
              <div className="mb-5 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-stone-500">
                  Generated Items
                </p>
                <h2 className="text-2xl font-semibold text-stone-950">
                  Saved outfit renders from S3
                </h2>
              </div>

              {isLoadingGeneratedItems ? (
                <p className="text-sm text-stone-500">
                  Loading generated items...
                </p>
              ) : generatedItems.length === 0 ? (
                <p className="rounded-[1.5rem] border border-dashed border-stone-300 bg-stone-50 px-5 py-10 text-center text-sm text-stone-500">
                  No generated outfits yet. Create an outfit idea and it will
                  show up here from the configured S3 generated-outfits folder.
                </p>
              ) : (
                <div className="grid gap-5 lg:grid-cols-2">
                  {generatedItems.map((generatedItem, index) => (
                    <article
                      className="overflow-hidden rounded-[1.5rem] border border-stone-200 bg-stone-50"
                      key={generatedItem.key}
                    >
                      <div className="aspect-[4/5] overflow-hidden bg-stone-200">
                        <div className="relative h-full w-full">
                          <Image
                            alt={`Generated outfit idea ${index + 1}`}
                            className="object-cover"
                            fill
                            sizes="(min-width: 1024px) 32vw, 90vw"
                            src={generatedItem.url}
                          />
                        </div>
                      </div>
                      <div className="space-y-3 px-5 py-5">
                        <p className="text-sm leading-6 text-stone-700">
                          {getGeneratedItemLabel(generatedItem.key)}
                        </p>
                        <p className="text-sm leading-6 text-stone-500">
                          {generatedItem.lastModified
                            ? `Generated ${formatTimestamp(generatedItem.lastModified)}`
                            : "Saved in the configured S3 generated-outfits folder"}
                        </p>
                        <a
                          className="inline-flex items-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-500 hover:text-stone-950"
                          href={generatedItem.url}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Open image
                        </a>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

function Badge({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-stone-300 bg-white/70 px-4 py-2 text-sm font-medium text-stone-700">
      {label}
    </span>
  );
}

function Field({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <label className="space-y-2 text-sm font-medium text-stone-700">
      <span>{label}</span>
      <input
        className="w-full rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 outline-none transition focus:border-stone-500 focus:bg-white"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolvePromise, rejectPromise) => {
    const fileReader = new FileReader();

    fileReader.onload = () => {
      if (typeof fileReader.result === "string") {
        resolvePromise(fileReader.result);
        return;
      }

      rejectPromise(new Error("Failed to read the selected file."));
    };

    fileReader.onerror = () => {
      rejectPromise(new Error("Failed to read the selected file."));
    };

    fileReader.readAsDataURL(file);
  });
}

function getFileExtension(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase();

  if (
    extension === "png" ||
    extension === "jpg" ||
    extension === "jpeg" ||
    extension === "webp"
  ) {
    return extension;
  }

  return "png";
}

function getNameFromFile(fileName: string) {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function normalizeTags(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function getGeneratedItemLabel(key: string) {
  const fileName = key.split("/").pop() ?? key;

  return getNameFromFile(fileName);
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
