import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useCreateInitiative, useGetSettings, getListInitiativesQueryKey, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

const formSchema = z.object({
  title: z.string().min(1, "Title is required"),
  department: z.string().min(1, "Department is required"),
  submitterName: z.string().min(1, "Submitter Name is required"),
  businessOwner: z.string().optional(),
  executiveSponsor: z.string().optional(),
  category: z.string().min(1, "Category is required"),
  problemStatement: z.string().min(1, "Problem statement is required"),
  currentProcess: z.string().min(1, "Current process is required"),
  desiredOutcome: z.string().min(1, "Desired outcome is required"),
  aiConcept: z.string().min(1, "AI concept is required"),
  prototypeGoal: z.string().min(1, "Prototype goal is required"),
  successMetric: z.string().min(1, "Success metric is required"),
  estimatedHoursSavedMonthly: z.coerce.number().min(0).optional(),
  estimatedRevenueOpportunity: z.coerce.number().min(0).optional(),
  estimatedCostSavings: z.coerce.number().min(0).optional(),
  customerImpact: z.string().optional(),
  complianceRisk: z.string().optional(),
  technicalComplexity: z.string().optional(),
  aiReadiness: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function SubmitInitiative() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: settings } = useGetSettings();
  
  const createInitiative = useCreateInitiative();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      department: "",
      submitterName: "",
      businessOwner: "",
      executiveSponsor: "",
      category: "",
      problemStatement: "",
      currentProcess: "",
      desiredOutcome: "",
      aiConcept: "",
      prototypeGoal: "",
      successMetric: "",
      estimatedHoursSavedMonthly: 0,
      estimatedRevenueOpportunity: 0,
      estimatedCostSavings: 0,
      customerImpact: "Medium",
      complianceRisk: "Medium",
      technicalComplexity: "Medium",
      aiReadiness: "Medium",
    },
  });

  const onSubmit = (data: FormValues) => {
    createInitiative.mutate(
      { data },
      {
        onSuccess: (result) => {
          queryClient.invalidateQueries({ queryKey: getListInitiativesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          toast({ title: "Success", description: "Initiative submitted successfully." });
          setLocation(`/initiatives/${result.id}`);
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to submit initiative.", variant: "destructive" });
        }
      }
    );
  };

  if (!settings) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Submit Initiative</h2>
        <p className="text-muted-foreground">Propose a new AI prototype or pilot project.</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField control={form.control} name="title" render={({ field }) => (
                <FormItem className="col-span-1 md:col-span-2">
                  <FormLabel>Initiative Title</FormLabel>
                  <FormControl><Input placeholder="e.g. Automated Invoice Processing" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              
              <FormField control={form.control} name="department" render={({ field }) => (
                <FormItem>
                  <FormLabel>Department</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select Department" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {settings.departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="category" render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select Category" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {settings.categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="submitterName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Submitter Name</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="businessOwner" render={({ field }) => (
                <FormItem>
                  <FormLabel>Business Owner (Optional)</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="executiveSponsor" render={({ field }) => (
                <FormItem>
                  <FormLabel>Executive Sponsor (Optional)</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Business Problem & Future State</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField control={form.control} name="problemStatement" render={({ field }) => (
                <FormItem>
                  <FormLabel>Problem Statement</FormLabel>
                  <FormControl><Textarea className="min-h-[100px]" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="currentProcess" render={({ field }) => (
                <FormItem>
                  <FormLabel>Current Process</FormLabel>
                  <FormControl><Textarea className="min-h-[100px]" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="desiredOutcome" render={({ field }) => (
                <FormItem>
                  <FormLabel>Desired Future State</FormLabel>
                  <FormControl><Textarea className="min-h-[100px]" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>AI Concept & Goal</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField control={form.control} name="aiConcept" render={({ field }) => (
                <FormItem>
                  <FormLabel>AI Concept</FormLabel>
                  <CardDescription className="mb-2">How will AI solve this problem?</CardDescription>
                  <FormControl><Textarea className="min-h-[100px]" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="prototypeGoal" render={({ field }) => (
                <FormItem>
                  <FormLabel>Prototype Goal</FormLabel>
                  <CardDescription className="mb-2">What must be proven in the 2-week sprint?</CardDescription>
                  <FormControl><Textarea className="min-h-[100px]" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="successMetric" render={({ field }) => (
                <FormItem>
                  <FormLabel>Success Metric</FormLabel>
                  <FormControl><Input placeholder="e.g. 50% reduction in processing time" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Value Estimate & Risks</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <FormField control={form.control} name="estimatedHoursSavedMonthly" render={({ field }) => (
                <FormItem>
                  <FormLabel>Hours Saved / Month</FormLabel>
                  <FormControl><Input type="number" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="estimatedRevenueOpportunity" render={({ field }) => (
                <FormItem>
                  <FormLabel>Revenue Opportunity ($)</FormLabel>
                  <FormControl><Input type="number" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="estimatedCostSavings" render={({ field }) => (
                <FormItem>
                  <FormLabel>Cost Savings ($)</FormLabel>
                  <FormControl><Input type="number" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="customerImpact" render={({ field }) => (
                <FormItem>
                  <FormLabel>Customer Impact</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="Low">Low</SelectItem>
                      <SelectItem value="Medium">Medium</SelectItem>
                      <SelectItem value="High">High</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="complianceRisk" render={({ field }) => (
                <FormItem>
                  <FormLabel>Compliance Risk</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="Low">Low</SelectItem>
                      <SelectItem value="Medium">Medium</SelectItem>
                      <SelectItem value="High">High</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="technicalComplexity" render={({ field }) => (
                <FormItem>
                  <FormLabel>Technical Complexity</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="Low">Low</SelectItem>
                      <SelectItem value="Medium">Medium</SelectItem>
                      <SelectItem value="High">High</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="aiReadiness" render={({ field }) => (
                <FormItem>
                  <FormLabel>AI Readiness (Data Availability)</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="Low">Low</SelectItem>
                      <SelectItem value="Medium">Medium</SelectItem>
                      <SelectItem value="High">High</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Button variant="outline" type="button" onClick={() => setLocation("/")}>Cancel</Button>
            <Button type="submit" disabled={createInitiative.isPending}>
              {createInitiative.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit Initiative
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
